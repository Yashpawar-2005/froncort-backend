import client from "../helpers/db";

import { Request, Response } from "express";
import { mailingqueue } from "../helpers/helper";

export const create_kanban = (req: Request, res: Response) => {

}

export const createCard = async (req: Request, res: Response) => {
    try {
        const { kanbanId } = req.params;
        const { title, description, priority, label, dueDate, column, assigneeIds, attachedPages } = req.body;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        if (!kanbanId || !title) {
            return res.status(400).json({ error: "Kanban ID and title are required" });
        }
        const kanbanBoard = await client.kanbanboard.findUnique({
            where: { id: parseInt(kanbanId) },
            include: {
                project: {
                    include: {
                        members: {
                            where: { userId: userId },
                            select: { role: true }
                        },
                        owner: {
                            select: { id: true }
                        }
                    }
                }
            }
        });

        if (!kanbanBoard) {
            return res.status(404).json({ error: "Kanban board not found" });
        }
        const isOwner = kanbanBoard.project.owner.id === userId;
        const memberRole = kanbanBoard.project.members[0]?.role;
        const canCreateCard = isOwner || ['ADMIN', 'EDITOR'].includes(memberRole);

        if (!canCreateCard) {
            return res.status(403).json({ error: "You don't have permission to create cards in this project" });
        }
        const newCard = await client.card.create({
            data: {
                title,
                description: description || null,
                priority: priority || 'MODERATE',
                label: label || 'general',
                dueDate: dueDate ? new Date(dueDate) : null,
                attachedPages: attachedPages || [],
                column: column || 'TODO',
                boardId: parseInt(kanbanId),
                creatorId: userId,
                assignees: assigneeIds && assigneeIds.length > 0 ? {
                    create: assigneeIds.map((assigneeId: number) => ({
                        userId: assigneeId
                    }))
                } : undefined
            },
            include: {
                assignees: {
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
                creator: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        assigneeIds.map((assignee: any) => {
            console.log(assignee)
            mailingqueue.add("mailing", {
                type: "CARD_UPDATE",
                userIds: assignee,
                cardInfo: {
                    title: title,
                    label: label,
                    dueDate: dueDate
                }
            })
        })

        await client.kanbanboard.update({
            where: { id: parseInt(kanbanId) },
            data: { count: { increment: 1 } }
        });

        res.status(201).json({
            success: true,
            data: newCard
        });

    } catch (error) {
        console.error("Error creating card:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const getUserPermissions = async (req: Request, res: Response) => {
    try {
        const { kanbanId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        if (!kanbanId) {
            return res.status(400).json({ error: "Kanban ID is required" });
        }

        const kanbanBoard = await client.kanbanboard.findUnique({
            where: { id: parseInt(kanbanId) },
            include: {
                project: {
                    include: {
                        members: {
                            where: { userId: userId },
                            select: { role: true }
                        },
                        owner: {
                            select: { id: true }
                        }
                    }
                }
            }
        });

        if (!kanbanBoard) {
            return res.status(404).json({ error: "Kanban board not found" });
        }

        const isOwner = kanbanBoard.project.owner.id === userId;
        const memberRole = kanbanBoard.project.members[0]?.role;

        const permissions = {
            canCreateCard: isOwner || ['ADMIN', 'EDITOR'].includes(memberRole),
            canEditCard: isOwner || ['ADMIN', 'EDITOR'].includes(memberRole),
            canDeleteCard: isOwner || ['ADMIN'].includes(memberRole),
            role: isOwner ? 'OWNER' : memberRole || 'NONE'
        };

        res.status(200).json({
            success: true,
            data: permissions
        });

    } catch (error) {
        console.error("Error getting user permissions:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const getKanbanWithCards = async (req: Request, res: Response) => {
    try {
        const { kanbanId } = req.params;

        if (!kanbanId) {
            return res.status(400).json({ error: "Kanban ID is required" });
        }

        const kanbanData = await client.kanbanboard.findUnique({
            where: {
                id: parseInt(kanbanId)
            },
            include: {
                cards: {
                    include: {
                        assignees: {
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
                        creator: {
                            select: {
                                id: true,
                                username: true,
                                email: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                project: {
                    select: {
                        id: true,
                        name: true,
                        ownerId: true,
                        pages: {
                            select: {
                                id: true,
                                title: true
                            }
                        }
                    }
                }
            }
        });

        if (!kanbanData) {
            return res.status(404).json({ error: "Kanban board not found" });
        }

        res.status(200).json({
            success: true,
            data: kanbanData
        });

    } catch (error) {
        console.error("Error fetching kanban data:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const getKanbanByProjectId = async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required" });
        }

        const kanbanData = await client.kanbanboard.findUnique({
            where: {
                projectId: parseInt(projectId)
            },
            include: {
                cards: {
                    include: {
                        assignees: {
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
                        creator: {
                            select: {
                                id: true,
                                username: true,
                                email: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                project: {
                    select: {
                        id: true,
                        name: true,
                        ownerId: true,
                        pages: {
                            select: {
                                id: true,
                                title: true
                            }
                        }
                    }
                }
            }
        });

        if (!kanbanData) {
            return res.status(404).json({ error: "Kanban board not found for this project" });
        }

        res.status(200).json({
            success: true,
            data: kanbanData
        });

    } catch (error) {
        console.error("Error fetching kanban data by project:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const getProjectMembers = async (req: Request, res: Response) => {
    try {
        const { kanbanId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        if (!kanbanId) {
            return res.status(400).json({ error: "Kanban ID is required" });
        }

        const kanbanBoard = await client.kanbanboard.findUnique({
            where: { id: parseInt(kanbanId) },
            include: {
                project: {
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
                        },
                        owner: {
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

        if (!kanbanBoard) {
            return res.status(404).json({ error: "Kanban board not found" });
        }

        // Combine owner and members
        const allMembers = [
            kanbanBoard.project.owner,
            ...kanbanBoard.project.members.map(member => member.user)
        ];

        // Remove duplicates based on id
        const uniqueMembers = allMembers.filter((member, index, self) =>
            index === self.findIndex(m => m.id === member.id)
        );

        res.status(200).json({
            success: true,
            data: uniqueMembers
        });

    } catch (error) {
        console.error("Error getting project members:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const updateCardColumn = async (req: Request, res: Response) => {
    try {
        const { cardId } = req.params;
        const { column } = req.body;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        if (!cardId || !column) {
            return res.status(400).json({ error: "Card ID and column are required" });
        }

        // Validate column value
        const validColumns = ['TODO', 'IN_PROGRESS', 'DONE'];
        if (!validColumns.includes(column)) {
            return res.status(400).json({ error: "Invalid column value" });
        }

        // Get card with board and project info for permission check
        const card = await client.card.findUnique({
            where: { id: parseInt(cardId) },
            include: {
                board: {
                    include: {
                        project: {
                            include: {
                                members: {
                                    where: { userId: userId },
                                    select: { role: true }
                                },
                                owner: {
                                    select: { id: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!card) {
            return res.status(404).json({ error: "Card not found" });
        }

        // Check permissions - only OWNER, ADMIN, or EDITOR can move cards
        const isOwner = card.board.project.owner.id === userId;
        const memberRole = card.board.project.members[0]?.role;
        const canEditCard = isOwner || ['ADMIN', 'EDITOR'].includes(memberRole);

        if (!canEditCard) {
            return res.status(403).json({ error: "You don't have permission to move cards in this project" });
        }

        // Update the card column
        const updatedCard = await client.card.update({
            where: { id: parseInt(cardId) },
            data: { column: column },
            include: {
                assignees: {
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
                creator: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            data: updatedCard
        });

    } catch (error) {
        console.error("Error updating card column:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const getProjectPages = async (req: Request, res: Response) => {
    try {
        const { kanbanId } = req.params;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        if (!kanbanId) {
            return res.status(400).json({ error: "Kanban ID is required" });
        }

        const kanbanBoard = await client.kanbanboard.findUnique({
            where: { id: parseInt(kanbanId) },
            include: {
                project: {
                    include: {
                        pages: {
                            select: {
                                id: true,
                                title: true
                            }
                        }
                    }
                }
            }
        });

        if (!kanbanBoard) {
            return res.status(404).json({ error: "Kanban board not found" });
        }

        res.status(200).json({
            success: true,
            data: kanbanBoard.project.pages
        });

    } catch (error) {
        console.error("Error getting project pages:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}

export const updateCard = async (req: Request, res: Response) => {
    try {
        const { cardId } = req.params;
        const { title, description, priority, label, dueDate, attachedPages } = req.body;
        const userId = req.userId;

        if (!userId) {
            return res.status(401).json({ error: "User not authenticated" });
        }

        if (!cardId) {
            return res.status(400).json({ error: "Card ID is required" });
        }

        // Get card with board and project info for permission check
        const card = await client.card.findUnique({
            where: { id: parseInt(cardId) },
            include: {
                board: {
                    include: {
                        project: {
                            include: {
                                members: {
                                    where: { userId: userId },
                                    select: { role: true }
                                },
                                owner: {
                                    select: { id: true }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!card) {
            return res.status(404).json({ error: "Card not found" });
        }

        // Check permissions - only OWNER, ADMIN, or EDITOR can edit cards
        const isOwner = card.board.project.owner.id === userId;
        const memberRole = card.board.project.members[0]?.role;
        const canEditCard = isOwner || ['ADMIN', 'EDITOR'].includes(memberRole);

        if (!canEditCard) {
            return res.status(403).json({ error: "You don't have permission to edit cards in this project" });
        }

        // Prepare update data (only include fields that are provided)
        const updateData: any = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (priority !== undefined) updateData.priority = priority;
        if (label !== undefined) updateData.label = label;
        if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
        if (attachedPages !== undefined) updateData.attachedPages = attachedPages;

        // Update the card
        const updatedCard = await client.card.update({
            where: { id: parseInt(cardId) },
            data: updateData,
            include: {
                assignees: {
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
                creator: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        res.status(200).json({
            success: true,
            data: updatedCard
        });

    } catch (error) {
        console.error("Error updating card:", error);
        res.status(500).json({
            error: "Internal server error",
            message: error instanceof Error ? error.message : "Unknown error"
        });
    }
}
