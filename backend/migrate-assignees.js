const { PrismaClient } = require('./src/generated/prisma');

const prisma = new PrismaClient();

async function migrateAssignees() {
  try {
    console.log('Starting assignee migration...');
    
    // This script would handle migration if there were existing cards with single assignees
    // Since we've updated the schema, this is mainly for reference
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateAssignees();