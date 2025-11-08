import { Request, Response } from "express";
import client from "../helpers/db";
import { getIO } from "../helpers/socket";




function generateUniqueId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomPart}`;
}

export const createPage = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { title } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!projectId || !title) {
      return res.status(400).json({ error: "Project ID and title are required" });
    }

    const projectIdInt = parseInt(projectId);
    if (isNaN(projectIdInt)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    // Check if user has permission to create pages (OWNER, ADMIN, or EDITOR)
    const project = await client.project.findUnique({
      where: { id: projectIdInt },
      include: {
        members: {
          where: { userId: userId },
          select: { role: true }
        },
        owner: { select: { id: true } }
      }
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const isOwner = project.owner.id === userId;
    const memberRole = project.members[0]?.role;
    const canCreatePage = isOwner || ['ADMIN', 'EDITOR'].includes(memberRole);

    if (!canCreatePage) {
      return res.status(403).json({ error: "You don't have permission to create pages in this project" });
    }

    // Create the page
    const newPage = await client.page.create({
      data: {
        title,
        // content: content || '',
        projectId: projectIdInt
      }
    });
    const uniqueString = generateUniqueId()
    await client.pageVersion.create({
      data: {
        uniqueString,
        pageid: newPage.id,
        projectId: projectIdInt,
        // content:""
      }
    })

    res.status(201).json({
      success: true,
      data: newPage
    });

  } catch (error) {
    console.error("Error creating page:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const getPageById = async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!pageId) {
      return res.status(400).json({ error: "Page ID is required" });
    }

    const pageIdInt = parseInt(pageId);
    if (isNaN(pageIdInt)) {
      return res.status(400).json({ error: "Invalid page ID" });
    }

    // Get page with project info for permission check
    const page = await client.page.findUnique({
      where: { id: pageIdInt },
      include: {
        project: {
          include: {
            members: {
              where: { userId: userId },
              select: { role: true }
            },
            owner: { select: { id: true } }
          }
        }
      }
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check if user has access to this project
    const isOwner = page.project.owner.id === userId;
    const memberRole = page.project.members[0]?.role;
    const hasAccess = isOwner || memberRole;

    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to this page" });
    }

    // Get all versions for this page (minimal data), ordered by version number (latest first)
    const allVersions = await client.pageVersion.findMany({
      where: { pageid: pageIdInt },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        uniqueString: true
      }
    });

    // Get full data for the latest version only
    const latestVersionFull = await client.pageVersion.findFirst({
      where: { pageid: pageIdInt },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        content: true,
        uniqueString: true,
        count: true,
        projectId: true,
        pageid: true
      }
    });

    // Get updates for the current version where what_count matches currentVersion.count
    const currentVersionUpdates = latestVersionFull ? await client.updates.findMany({
      where: {
        belongs_to_pageVersionId: latestVersionFull.id,
        what_count: latestVersionFull.count
      },
      select: {
        id: true,
        diffContent: true,
        what_count: true
      }
    }) : [];

    // Determine user permissions
    const permissions = {
      canEdit: isOwner || ['ADMIN', 'EDITOR'].includes(memberRole),
      canDelete: isOwner || ['ADMIN'].includes(memberRole),
      role: isOwner ? 'OWNER' : memberRole || 'NONE'
    };

    res.status(200).json({
      success: true,
      data: {
        page,
        versions: allVersions,
        currentVersion: latestVersionFull ? {
          ...latestVersionFull,
          updates: currentVersionUpdates
        } : null,
        permissions
      }
    });

  } catch (error) {
    console.error("Error getting page:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const updatePage = async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const { title, content } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!pageId) {
      return res.status(400).json({ error: "Page ID is required" });
    }

    const pageIdInt = parseInt(pageId);
    if (isNaN(pageIdInt)) {
      return res.status(400).json({ error: "Invalid page ID" });
    }

    // Get page with project info for permission check
    const page = await client.page.findUnique({
      where: { id: pageIdInt },
      include: {
        project: {
          include: {
            members: {
              where: { userId: userId },
              select: { role: true }
            },
            owner: { select: { id: true } }
          }
        }
      }
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check permissions - only OWNER, ADMIN, or EDITOR can edit pages
    const isOwner = page.project.owner.id === userId;
    const memberRole = page.project.members[0]?.role;
    const canEdit = isOwner || ['ADMIN', 'EDITOR'].includes(memberRole);

    if (!canEdit) {
      return res.status(403).json({ error: "You don't have permission to edit this page" });
    }

    // Update the page
    const updatedPage = await client.page.update({
      where: { id: pageIdInt },
      data: {
        ...(title && { title }),
        ...(content !== undefined && { content })
      }
    });

    res.status(200).json({
      success: true,
      data: updatedPage
    });

  } catch (error) {
    console.error("Error updating page:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const getPageVersionById = async (req: Request, res: Response) => {
  try {
    const { versionId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!versionId) {
      return res.status(400).json({ error: "Version ID is required" });
    }

    const versionIdInt = parseInt(versionId);
    if (isNaN(versionIdInt)) {
      return res.status(400).json({ error: "Invalid version ID" });
    }

    // Get version with page and project info for permission check
    const version = await client.pageVersion.findUnique({
      where: { id: versionIdInt },
      include: {
        page: {
          include: {
            project: {
              include: {
                members: {
                  where: { userId: userId },
                  select: { role: true }
                },
                owner: { select: { id: true } }
              }
            }
          }
        }
      }
    });

    if (!version) {
      return res.status(404).json({ error: "Version not found" });
    }

    // Check if user has access to this project
    const isOwner = version.page.project.owner.id === userId;
    const memberRole = version.page.project.members[0]?.role;
    const hasAccess = isOwner || memberRole;

    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to this version" });
    }

    // Get updates for this version where what_count matches version.count
    const versionUpdates = await client.updates.findMany({
      where: {
        belongs_to_pageVersionId: version.id,
        what_count: version.count
      },
      select: {
        id: true,
        diffContent: true,
        what_count: true
      }
    });

    // Return version data with updates
    const versionData = {
      id: version.id,
      version: version.version,
      content: version.content,
      uniqueString: version.uniqueString,
      count: version.count,
      projectId: version.projectId,
      pageid: version.pageid,
      updates: versionUpdates
    };

    res.status(200).json({
      success: true,
      data: versionData
    });

  } catch (error) {
    console.error("Error getting page version:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const comparePageVersions = async (req: Request, res: Response) => {
  try {
    const { version1Id, version2Id } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!version1Id || !version2Id) {
      return res.status(400).json({ error: "Both version IDs are required" });
    }

    const version1IdInt = parseInt(version1Id);
    const version2IdInt = parseInt(version2Id);

    if (isNaN(version1IdInt) || isNaN(version2IdInt)) {
      return res.status(400).json({ error: "Invalid version IDs" });
    }

    // Get both versions with permission checks
    const [version1, version2] = await Promise.all([
      client.pageVersion.findUnique({
        where: { id: version1IdInt },
        include: {
          page: {
            include: {
              project: {
                include: {
                  members: {
                    where: { userId: userId },
                    select: { role: true }
                  },
                  owner: { select: { id: true } }
                }
              }
            }
          }
        }
      }),
      client.pageVersion.findUnique({
        where: { id: version2IdInt },
        include: {
          page: {
            include: {
              project: {
                include: {
                  members: {
                    where: { userId: userId },
                    select: { role: true }
                  },
                  owner: { select: { id: true } }
                }
              }
            }
          }
        }
      })
    ]);

    if (!version1 || !version2) {
      return res.status(404).json({ error: "One or both versions not found" });
    }

    // Check if both versions belong to the same page
    if (version1.pageid !== version2.pageid) {
      return res.status(400).json({ error: "Versions must belong to the same page" });
    }

    // Check permissions for the page
    const isOwner = version1.page.project.owner.id === userId;
    const memberRole = version1.page.project.members[0]?.role;
    const hasAccess = isOwner || memberRole;

    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to these versions" });
    }

    // Get updates for both versions
    const [version1Updates, version2Updates] = await Promise.all([
      client.updates.findMany({
        where: {
          belongs_to_pageVersionId: version1.id,
          what_count: version1.count
        },
        select: {
          id: true,
          diffContent: true,
          what_count: true
        }
      }),
      client.updates.findMany({
        where: {
          belongs_to_pageVersionId: version2.id,
          what_count: version2.count
        },
        select: {
          id: true,
          diffContent: true,
          what_count: true
        }
      })
    ]);

    // Return both versions with their updates
    res.status(200).json({
      success: true,
      data: {
        version1: {
          id: version1.id,
          version: version1.version,
          content: version1.content,
          uniqueString: version1.uniqueString,
          count: version1.count,
          updates: version1Updates
        },
        version2: {
          id: version2.id,
          version: version2.version,
          content: version2.content,
          uniqueString: version2.uniqueString,
          count: version2.count,
          updates: version2Updates
        },
        pageInfo: {
          id: version1.page.id,
          title: version1.page.title
        }
      }
    });

  } catch (error) {
    console.error("Error comparing page versions:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const createAutoPageVersion = async (req: Request, res: Response) => {
  try {
    const { pageId, projectId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!pageId || !projectId) {
      return res.status(400).json({ error: "Page ID and Project ID are required" });
    }

    const pageIdInt = parseInt(pageId);
    const projectIdInt = parseInt(projectId);

    if (isNaN(pageIdInt) || isNaN(projectIdInt)) {
      return res.status(400).json({ error: "Invalid page ID or project ID" });
    }

    const page = await client.page.findUnique({
      where: { id: pageIdInt },
      include: {
        project: {
          include: {
            members: {
              where: { userId: userId },
              select: { role: true }
            },
            owner: { select: { id: true } }
          }
        }
      }
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    if (page.projectId !== projectIdInt) {
      return res.status(400).json({ error: "Page does not belong to the specified project" });
    }

    const isOwner = page.project.owner.id === userId;
    const memberRole = page.project.members[0]?.role;
    const canEdit = isOwner || ['ADMIN', 'EDITOR'].includes(memberRole);

    if (!canEdit) {
      return res.status(403).json({ error: "You don't have permission to create versions for this page" });
    }

    const uniqueString = generateUniqueId();

    // Get the latest version to copy its content
    const latestVersion = await client.pageVersion.findFirst({
      where: { pageid: pageIdInt },
      orderBy: { version: 'desc' }
    });

    const nextVersion = (latestVersion?.version || 0) + 1;

    // Create new version with content copied from the previous version
    const newVersion = await client.pageVersion.create({
      data: {
        version: nextVersion,
        content: latestVersion?.content || null, // Copy content from previous version
        uniqueString: uniqueString,
        projectId: projectIdInt,
        pageid: pageIdInt,
        count: latestVersion?.count || 0 // Also copy the count from previous version
      }
    });

    // Emit websocket event for new version creation
    try {
      const io = getIO();
      const roomName = `project-${projectId}`;

      // Get user info for the event
      const user = await client.user.findUnique({
        where: { id: userId },
        select: { username: true }
      });

      if (user) {
        io.to(roomName).emit('page-updated', {
          type: 'page-version-created',
          pageId: pageIdInt,
          pageTitle: page.title,
          versionId: newVersion.id,
          versionNumber: newVersion.version,
          username: user.username,
          timestamp: new Date()
        });

        // Also create a log entry
        await client.log.create({
          data: {
            message: `${user.username} created version ${newVersion.version} for page "${page.title}"`,
            docId: pageIdInt,
            projectid: projectIdInt,
            userId: userId,
            createdByUserId: userId
          }
        });
      }
    } catch (socketError) {
      console.error('Error emitting websocket event:', socketError);
      // Don't fail the request if websocket fails
    }

    res.status(201).json({
      success: true,
      data: newVersion
    });

  } catch (error) {
    console.error("Error creating auto page version:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
export const notifyMention = async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;
    const { mentionedUserIds } = req.body; // Array of user IDs that were mentioned
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!pageId || !mentionedUserIds || !Array.isArray(mentionedUserIds)) {
      return res.status(400).json({ error: "Page ID and mentioned user IDs are required" });
    }

    const pageIdInt = parseInt(pageId);
    if (isNaN(pageIdInt)) {
      return res.status(400).json({ error: "Invalid page ID" });
    }

    // Get page with project info
    const page = await client.page.findUnique({
      where: { id: pageIdInt },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            members: {
              where: { userId: userId },
              select: { role: true }
            },
            owner: { select: { id: true } }
          }
        }
      }
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check if user has access to this project
    const isOwner = page.project.owner.id === userId;
    const memberRole = page.project.members[0]?.role;
    const hasAccess = isOwner || memberRole;

    if (!hasAccess) {
      return res.status(403).json({ error: "You don't have access to this page" });
    }

    // Get the user who mentioned
    const mentioner = await client.user.findUnique({
      where: { id: userId },
      select: { username: true }
    });

    if (!mentioner) {
      return res.status(404).json({ error: "Mentioner user not found" });
    }

    // Get mentioned users' emails
    const mentionedUsers = await client.user.findMany({
      where: {
        id: { in: mentionedUserIds }
      },
      select: {
        id: true,
        email: true,
        username: true
      }
    });

    // Import mailing queue
    const { mailingqueue } = await import("../helpers/helper");

    // Send email notification to each mentioned user
    for (const mentionedUser of mentionedUsers) {
      // Don't send notification if user mentioned themselves
      if (mentionedUser.id === userId) continue;

      await mailingqueue.add("mailing", {
        type: "MENTION",
        email: mentionedUser.email,
        mentionedUsername: mentionedUser.username,
        mentionerUsername: mentioner.username,
        pageTitle: page.title,
        pageId: page.id,
        projectName: page.project.name,
        projectId: page.project.id
      });
    }

    res.status(200).json({
      success: true,
      message: `Notifications sent to ${mentionedUsers.length} user(s)`
    });

  } catch (error) {
    console.error("Error notifying mention:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
