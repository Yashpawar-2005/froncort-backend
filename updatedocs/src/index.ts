import { PrismaClient } from "./generated/prisma/client";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from 'dotenv';
import nodemailer from 'nodemailer'
dotenv.config();

// Singleton pattern for Prisma Client
declare global {
  var prisma: PrismaClient | undefined;
}

const client = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.prisma = client;
}

const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const worker = new Worker(
  "saveDocsUpdate",
  async (job: any) => {
    const pageVersionId = job.data.key;
    const content = job.data.content;
    const page_version_ka_konsa_count = job.data.pageVersionCount;
    console.log(page_version_ka_konsa_count)
    console.log(`💾 Saving ${pageVersionId}`);
    const buffer = Buffer.from(Object.values(content) as number[]);
    await client.updates.create({
      data: {
        diffContent: buffer,
        belongs_to_pageVersionId: pageVersionId,
        what_count: page_version_ka_konsa_count
      }
    })

  },
  { connection }
);

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} saved successfully`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed: ${err.message}`);
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MY_EMAIL ,
    pass: process.env.GMAIL_PASSWORD 
  },
});



const worker2 = new Worker(
  "mailing",
  async (job) => {
    console.log("Processing mailing job...");
    console.log("Received job data:", job.data);

    try {
      const { type, userIds, cardInfo } = job.data;

      if (!type) {
        console.error("Missing event type in job data.");
        return;
      }

      if (type === "CARD_UPDATE") {
        if (!userIds || !cardInfo) {
          console.error("Missing userIds or cardInfo in job data:", job.data);
          return;
        }

        const user = await client.user.findFirst({ where: { id: userIds } });

        if (!user) {
          console.error(`No user found for ID: ${userIds}`);
          return;
        }

        const { title, label, dueDate } = cardInfo;
        if (!title || !label || !dueDate) {
          console.error("Incomplete cardInfo:", cardInfo);
          return;
        }

        console.log(`Preparing mail for user: ${user.email}`);

        const mailOptions = {
          from: `"Froncort Assignment" <${process.env.MY_EMAIL}>`,
          to: user.email,
          subject: `Card Updated - ${title}`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; max-width: 480px; margin: auto;">
              <h2 style="color: #16a34a; text-align: center;">Card Assigned</h2>
              <p>Hello <strong>${user.username || "User"}</strong>,</p>
              <p>The following card has been assigned:</p>
              <div style="background: #fff; border: 1px solid #d1d5db; border-radius: 6px; padding: 15px; margin-top: 10px;">
                <p><strong>Title:</strong> ${title}</p>
                <p><strong>Label:</strong> ${label}</p>
                <p><strong>Due Date:</strong> ${new Date(dueDate).toLocaleString()}</p>
              </div>
              <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">Best,<br/>Your yash here</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Mail sent successfully to ${user.email} for CARD_UPDATE.`);
      }

      else if (type === "ADD_USER") {
        const { email } = job.data;

        if (!email) {
          console.error("Missing email  for ADD_USER event.");
          return;
        }

        const mailOptions = {
          from: `"Froncort Team" <${process.env.MY_EMAIL}>`,
          to: email,
          subject: "Adding to Project",
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; max-width: 480px; margin: auto;">
              <p>you  were added to a project</p>
              <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">Best,<br/>The Froncort Team</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Welcome mail sent to ${email}`);
      }

      else if (type === "MENTION") {
        const { email, mentionedUsername, mentionerUsername, pageTitle, pageId, projectName, projectId } = job.data;

        if (!email || !mentionerUsername || !pageTitle || !projectName) {
          console.error("Missing required fields for MENTION event.");
          return;
        }

         const mailOptions = {
          from: `"Froncort Notifications" <${process.env.MY_EMAIL}>`,
          to: email,
          subject: `You were mentioned in "${pageTitle}"`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #eff6ff; border-radius: 8px; border: 1px solid #bfdbfe; max-width: 480px; margin: auto;">
              <h2 style="color: #2563eb; text-align: center;">📝 You've Been Mentioned!</h2>
              <p>Hello <strong>${mentionedUsername || "there"}</strong>,</p>
              <p><strong>${mentionerUsername}</strong> mentioned you in a document.</p>
              <div style="background: #fff; border: 1px solid #d1d5db; border-radius: 6px; padding: 15px; margin-top: 10px;">
                <p><strong>Project:</strong> ${projectName}</p>
                <p><strong>Document:</strong> ${pageTitle}</p>
                <p><strong>Document ID:</strong> ${pageId}</p>
              </div>
              <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">Best,<br/>The Froncort Team</p>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Mention notification sent to ${email}`);
      }

      else {
        console.warn(`Unknown event type: ${type}`);
      }
    } catch (err) {
      console.error("Unexpected error in mailing worker:", err);
    }
  },
  { connection }
);

worker2.on("completed", (job) => {
  console.log(`Job ${job.id} completed successfully.`);
});

worker2.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});



const worker3 = new Worker("saveDocs", async (job) => {
  const pageVersionId = job.data.pageVersionId
  const content = job.data.content;
  const buffer = Buffer.from(Object.values(content) as number[]);
  console.log("savvvvvvvvv")
  let d = await client.pageVersion.findFirst({
    where: {
      id: pageVersionId
    },
    select: {
      count: true
    }
  })
  if (!d) {
    console.log("ih")
    return;
  }
  console.log('adsf')
  // if(!d || !d.count){
  //   return;
  // }
  await client.pageVersion.update({
    where: { id: pageVersionId },
    data: { content: buffer, count: d?.count + 1 }
  });
  console.log("savvvvvvvvv")
}, { connection })
