import { Request, Response } from "express";
import client from "../helpers/db";
import { mailingqueue } from "../helpers/helper";
export const getAllProjects = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const ownedProjects = await client.project.findMany({
      where: { ownerId: userId },
      include: {
        owner: { select: { id: true, username: true, email: true } },
        members: {
          select: {
            id: true,
            role: true,
            title: true,
            description: true,
            user: { select: { id: true, username: true, email: true } }
          }
        },
        kanbanboard: { select: { count: true } },
        _count: { select: { pages: true } },
      }
    });
    const memberProjects = await client.projectMember.findMany({
      where: { userId },
      include: {
        project: {
          include: {
            owner: { select: { id: true, username: true, email: true } },
            members: {
              select: {
                id: true,
                role: true,
                title: true,
                description: true,
                user: { select: { id: true, username: true, email: true } }
              }
            },
            kanbanboard: { select: { count: true } },
            _count: { select: { pages: true } },
          }
        }
      }
    });
    const adminProjects = memberProjects
      .filter((m) => m.role === "ADMIN")
      .map((m) => m.project);

    const editorProjects = memberProjects
      .filter((m) => m.role === "EDITOR")
      .map((m) => m.project);

    const viewerProjects = memberProjects
      .filter((m) => m.role === "VIEWER")
      .map((m) => m.project);
    res.status(200).json({
      ownedProjects,
      adminProjects,
      editorProjects,
      viewerProjects,
    });

  } catch (error: any) {
    console.error("Get All Projects Error:", error);
    res.status(500).json({ message: error.message || "Internal Server Error" });
  }
};

export const getProjectById = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const project2Id = parseInt(projectId);
    console.log('Project ID:', projectId, 'Parsed:', project2Id);

    if (isNaN(project2Id) || project2Id <= 0) {
      console.log('Invalid project ID:', project2Id);
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const userId = req.userId;

    const data = await client.project.findFirst({
      where: {
        id: project2Id
      },
      include: {
        owner: { select: { id: true, username: true, email: true } },
        members: {
          select: {
            id: true,
            role: true,
            title: true,
            description: true,
            user: { select: { id: true, username: true, email: true } }
          }
        },
        kanbanboard: true,
        pages: {
          include: {
            _count: {
              select: { pageVersion: true }
            }
          }
        },
      }
    });

    if (!data) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.status(200).json({ data });

  } catch (error: any) {

    res.status(500).json({ error: error.message || "Failed to fetch project" });
  }
};


export const getOwnedProjectsForCreation = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const ownedProjects = await client.project.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        members: {
          select: {
            id: true,
            role: true,
            title: true,
            description: true,
            user: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({
      success: true,
      data: ownedProjects
    });

  } catch (error) {
    console.error("Error fetching owned projects:", error);
    res.status(500).json({
      message: "Internal server error",
      error: (error as Error).message,
    });
  }
};

export const createProject = async (req: Request, res: Response) => {
  const { name, copyFromProjectId } = req.body;
  const userId = req.userId;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (!name) {
    return res.status(400).json({ message: "No name provided" });
  }

  try {
    // Create the new project
    const newProject = await client.project.create({
      data: {
        name: name,
        ownerId: userId,
      },
    });

    // Create kanban board for the new project
    const newKanban = await client.kanbanboard.create({
      data: {
        projectId: newProject.id,
      }
    });

    // If copyFromProjectId is provided, copy members from that project
    if (copyFromProjectId) {
      const sourceProject = await client.project.findUnique({
        where: { 
          id: parseInt(copyFromProjectId),
          ownerId: userId // Ensure user owns the source project
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true
                }
              }
            }
          }
        }
      });

      if (sourceProject && sourceProject.members.length > 0) {
        // Copy all members with their roles and details
        const membersToCreate = sourceProject.members.map(member => ({
          userId: member.userId,
          projectId: newProject.id,
          role: member.role,
          title: member.title,
          description: member.description
        }));

        await client.projectMember.createMany({
          data: membersToCreate,
          skipDuplicates: true
        });

        // Send notification emails to copied members
        for (const member of sourceProject.members) {
          mailingqueue.add("mailing", {
            type: "ADD_USER",
            email: member.user.email,
            project: newProject.name
          });
        }
      }
    }

    // Fetch the complete project data to return
    const completeProject = await client.project.findUnique({
      where: { id: newProject.id },
      include: {
        owner: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          }
        },
        kanbanboard: true
      }
    });

    res.status(201).json({
      message: "Created project successfully",
      project: completeProject,
    });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({
      message: "Internal server error",
      error: (error as Error).message,
    });
  }
};

export const addUserToProject = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { email, role, title, description } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!projectId || !email || !role) {
      return res.status(400).json({ error: "Project ID, email, and role are required" });
    }

    const projectIdInt = parseInt(projectId);
    if (isNaN(projectIdInt)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

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
    const canAddUser = isOwner || memberRole === 'ADMIN';

    if (!canAddUser) {
      return res.status(403).json({ error: "You don't have permission to add users to this project" });
    }

    // Find the user by email
    const userToAdd = await client.user.findUnique({
      where: { email: email },
      select: { id: true, username: true, email: true }
    });

    if (!userToAdd) {
      return res.status(404).json({ error: "User not found with this email" });
    }

    // Check if user is already a member or owner
    if (project.owner.id === userToAdd.id) {
      return res.status(400).json({ error: "User is already the owner of this project" });
    }

    const existingMember = await client.projectMember.findUnique({
      where: {
        userId_projectId: {
          userId: userToAdd.id,
          projectId: projectIdInt
        }
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: "User is already a member of this project" });
    }

    // Validate role
    const validRoles = ['ADMIN', 'EDITOR', 'VIEWER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be ADMIN, EDITOR, or VIEWER" });
    }

    // Add user to project
    const newMember = await client.projectMember.create({
      data: {
        userId: userToAdd.id,
        projectId: projectIdInt,
        role: role,
        title: title || 'Team Member',
        description: description || null
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });
    await  mailingqueue.add("mailing",{
    type:"ADD_USER",
    email:newMember.user.email,
    project:project.name  
    }
    )
    res.status(201).json({
      success: true,
      message: "User added to project successfully",
      data: newMember
    });

  } catch (error) {
    console.error("Error adding user to project:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const removeUserFromProject = async (req: Request, res: Response) => {
  try {
    const { projectId, memberId } = req.params;
    const userId = req.userId;

    console.log('Remove user request:', { projectId, memberId, userId });

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!projectId || !memberId) {
      return res.status(400).json({ error: "Project ID and member ID are required" });
    }

    const projectIdInt = parseInt(projectId);
    const memberIdInt = parseInt(memberId);

    console.log('Parsed IDs:', { projectIdInt, memberIdInt });

    if (isNaN(projectIdInt) || isNaN(memberIdInt) || projectIdInt <= 0 || memberIdInt <= 0) {
      return res.status(400).json({ error: "Invalid project ID or member ID" });
    }

    // Check permissions
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
    const canRemoveUser = isOwner || memberRole === 'ADMIN';

    if (!canRemoveUser) {
      return res.status(403).json({ error: "You don't have permission to remove users from this project" });
    }

    // First verify the member exists and belongs to this project
    const memberToDelete = await client.projectMember.findUnique({
      where: { id: memberIdInt },
      include: { user: { select: { id: true, username: true, email: true } } }
    });

    if (!memberToDelete) {
      return res.status(404).json({ error: "Member not found" });
    }

    if (memberToDelete.projectId !== projectIdInt) {
      return res.status(400).json({ error: "Member does not belong to this project" });
    }

    // Remove the member
    const deletedMember = await client.projectMember.delete({
      where: { id: memberIdInt }
    });

    res.status(200).json({
      success: true,
      message: "User removed from project successfully",
      data: deletedMember
    });

  } catch (error) {
    console.error("Error removing user from project:", error);

    // Handle Prisma-specific errors
    if (error instanceof Error) {
      if (error.message.includes('Record to delete does not exist')) {
        return res.status(404).json({ error: "Member not found" });
      }
    }

    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { email } = req.query;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: "Email query parameter is required" });
    }

    // Search for users by email (partial match)
    const users = await client.user.findMany({
      where: {
        email: {
          contains: email,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        username: true,
        email: true
      },
      take: 10 // Limit results
    });

    res.status(200).json({
      success: true,
      data: users
    });

  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const getProjectLogs = async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    const projectIdInt = parseInt(projectId);
    if (isNaN(projectIdInt)) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    // Check if user has access to this project
    const project = await client.project.findFirst({
      where: {
        id: projectIdInt,
        OR: [
          { ownerId: userId },
          { members: { some: { userId: userId } } }
        ]
      }
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found or access denied" });
    }

    // Fetch logs for this project
    console.log(`Fetching logs for project ${projectIdInt}`);

    const logs = await client.log.findMany({
      where: {
        projectid: projectIdInt
      },
      include: {
        createdByUser: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100 // Limit to last 100 logs
    });

    console.log(`Found ${logs.length} logs for project ${projectIdInt}`);

    // Also check if there are any logs without projectid for debugging
    const orphanedLogs = await client.log.findMany({
      where: {
        projectid: null
      },
      take: 5
    });

    console.log(`Found ${orphanedLogs.length} orphaned logs (without projectid)`);

    res.status(200).json({
      success: true,
      data: logs
    });

  } catch (error) {
    console.error("Error fetching project logs:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};
