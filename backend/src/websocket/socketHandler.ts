import { Server, Socket } from 'socket.io';
import client from '../helpers/db';

// Track user connections: userId -> socketId
const userConnections = new Map<string, string>();

export const handleSocketConnection = (io: Server) => {
    io.on('connection', (socket: Socket) => {
        console.log('User connected:', socket.id);

        // Handle joining a project room
        socket.on('join-project', (data: { projectId: string, userId?: string }) => {
            const { projectId, userId } = data;
            const roomName = `project-${projectId}`;

            socket.join(roomName);
            console.log(`User ${socket.id} (userId: ${userId}) joined project ${projectId}`);

            // Store user info in socket data
            socket.data.projectId = projectId;
            socket.data.userId = userId;

            // Track user connection for individual notifications
            if (userId) {
                userConnections.set(userId, socket.id);
            }

            // Notify other users in the room
            socket.to(roomName).emit('user-joined', {
                socketId: socket.id,
                userId: userId,
                timestamp: new Date()
            });

            // Send current room info to the joining user
            socket.emit('joined-project', {
                projectId,
                roomName,
                timestamp: new Date()
            });
        });

        // Handle leaving a project room
        socket.on('leave-project', (projectId: string) => {
            const roomName = `project-${projectId}`;
            socket.leave(roomName);
            console.log(`User ${socket.id} left project ${projectId}`);

            // Notify other users in the room
            socket.to(roomName).emit('user-left', {
                socketId: socket.id,
                userId: socket.data.userId,
                timestamp: new Date()
            });
        });

        // Handle user activity/presence updates
        socket.on('user-activity', (data: { projectId: string, activity: string }) => {
            const { projectId, activity } = data;
            const roomName = `project-${projectId}`;

            socket.to(roomName).emit('user-activity-update', {
                socketId: socket.id,
                userId: socket.data.userId,
                activity,
                timestamp: new Date()
            });
        });

        // Handle card column change
        socket.on('card-column-changed', async (data: {
            cardId: number,
            newColumn: string,
            oldColumn: string,
            kanbanId: number,
            projectId: string,
            username: string
        }) => {
            const { cardId, newColumn, oldColumn, kanbanId, projectId, username } = data;
            const roomName = `project-${projectId}`;



            try {
                // Get card and kanban board info for logging
                const [card, kanbanBoard] = await Promise.all([
                    client.card.findUnique({
                        where: { id: cardId },
                        select: { title: true }
                    }),
                    client.kanbanboard.findUnique({
                        where: { id: kanbanId },
                        include: {
                            project: {
                                select: { name: true }
                            }
                        }
                    })
                ]);

                const cardTitle = card?.title || 'Unknown Card';
                const boardTitle = kanbanBoard?.project.name || 'Kanban Board';

                // Create log entry
                const userId = socket.data.userId ? parseInt(socket.data.userId) : null;
                if (userId && !isNaN(userId)) {
                    await client.log.create({
                        data: {
                            message: `${username} moved "${cardTitle}" from ${oldColumn} to ${newColumn} in ${boardTitle}`,
                            kanbanId: kanbanId,
                            projectid: parseInt(projectId),
                            userId: userId,
                            createdByUserId: userId
                        }
                    });
                } else {
                    console.warn('Cannot create log: userId is invalid or missing');
                }

                // Broadcast to other users in the room
                const broadcastData = {
                    type: 'column-change',
                    cardId,
                    newColumn,
                    oldColumn,
                    username,
                    boardTitle,
                    timestamp: new Date()
                };

                socket.to(roomName).emit('card-updated', broadcastData);

                console.log(`Card ${cardId} moved from ${oldColumn} to ${newColumn} by ${username}`);
            } catch (error) {
                console.error('Error logging card column change:', error);
            }
        });

        // Handle card creation
        socket.on('card-created', async (data: {
            cardId: number,
            cardTitle: string,
            kanbanId: number,
            projectId: string,
            username: string,
            column: string
        }) => {
            const { cardId, cardTitle, kanbanId, projectId, username, column } = data;
            const roomName = `project-${projectId}`;



            try {
                // Get kanban board title
                const kanbanBoard = await client.kanbanboard.findUnique({
                    where: { id: kanbanId },
                    include: {
                        project: {
                            select: { name: true }
                        }
                    }
                });

                const boardTitle = kanbanBoard?.project.name || 'Kanban Board';

                // Create log entry
                const userId = socket.data.userId ? parseInt(socket.data.userId) : null;
                if (userId && !isNaN(userId)) {
                    await client.log.create({
                        data: {
                            message: `${username} created card "${cardTitle}" in ${column} on ${boardTitle}`,
                            kanbanId: kanbanId,
                            projectid: parseInt(projectId),
                            userId: userId,
                            createdByUserId: userId
                        }
                    });
                } else {
                    console.warn('Cannot create log: userId is invalid or missing');
                }

                // Broadcast to other users in the room
                const broadcastData = {
                    type: 'card-created',
                    cardId,
                    cardTitle,
                    column,
                    username,
                    boardTitle,
                    timestamp: new Date()
                };

                socket.to(roomName).emit('card-updated', broadcastData);

                console.log(`Card "${cardTitle}" created by ${username}`);
            } catch (error) {
                console.error('Error logging card creation:', error);
            }
        });

        // Handle card edit
        socket.on('card-edited', async (data: {
            cardId: number,
            cardTitle: string,
            kanbanId: number,
            projectId: string,
            username: string,
            changes: string[]
        }) => {
            const { cardId, cardTitle, kanbanId, projectId, username, changes } = data;
            const roomName = `project-${projectId}`;

            try {
                // Get kanban board title
                const kanbanBoard = await client.kanbanboard.findUnique({
                    where: { id: kanbanId },
                    include: {
                        project: {
                            select: { name: true }
                        }
                    }
                });

                const boardTitle = kanbanBoard?.project.name || 'Kanban Board';

                // Create log entry
                const changesText = changes.join(', ');
                const userId = socket.data.userId ? parseInt(socket.data.userId) : null;
                if (userId && !isNaN(userId)) {
                    await client.log.create({
                        data: {
                            message: `${username} edited card "${cardTitle}" (${changesText}) on ${boardTitle}`,
                            kanbanId: kanbanId,
                            projectid: parseInt(projectId),
                            userId: userId,
                            createdByUserId: userId
                        }
                    });
                } else {
                    console.warn('Cannot create log: userId is invalid or missing');
                }

                // Broadcast to other users in the room
                socket.to(roomName).emit('card-updated', {
                    type: 'card-edited',
                    cardId,
                    cardTitle,
                    changes,
                    username,
                    boardTitle,
                    timestamp: new Date()
                });

                console.log(`Card "${cardTitle}" edited by ${username}`);
            } catch (error) {
                console.error('Error logging card edit:', error);
            }
        });

        // Handle card assignment
        socket.on('card-assigned', async (data: {
            cardId: number,
            cardTitle: string,
            kanbanId: number,
            projectId: string,
            assignerUsername: string,
            assigneeUsername: string
        }) => {
            const { cardId, cardTitle, kanbanId, projectId, assignerUsername, assigneeUsername } = data;
            const roomName = `project-${projectId}`;

            try {
                // Get kanban board title and assignee information
                const [kanbanBoard, assigneeUser] = await Promise.all([
                    client.kanbanboard.findUnique({
                        where: { id: kanbanId },
                        include: {
                            project: {
                                select: { name: true }
                            }
                        }
                    }),
                    client.user.findUnique({
                        where: { username: assigneeUsername },
                        select: { id: true, username: true }
                    })
                ]);

                const boardTitle = kanbanBoard?.project.name || 'Kanban Board';

                // Create log entry
                const userId = socket.data.userId ? parseInt(socket.data.userId) : null;
                if (userId && !isNaN(userId)) {
                    await client.log.create({
                        data: {
                            message: `${assignerUsername} assigned card "${cardTitle}" to ${assigneeUsername} on ${boardTitle}`,
                            kanbanId: kanbanId,
                            projectid: parseInt(projectId),
                            userId: userId,
                            createdByUserId: userId
                        }
                    });
                } else {
                    console.warn('Cannot create log: userId is invalid or missing');
                }

                // Get assignee socket ID to exclude from broadcast
                const assigneeSocketId = assigneeUser ? userConnections.get(assigneeUser.id.toString()) : null;

                // Broadcast to other users in the room (excluding the assignee)
                const broadcastData = {
                    type: 'card-assigned',
                    cardId,
                    cardTitle,
                    assignerUsername,
                    assigneeUsername,
                    boardTitle,
                    timestamp: new Date()
                };

                // Send to all users in room except the assignee
                if (assigneeSocketId) {
                    socket.to(roomName).except(assigneeSocketId).emit('card-updated', broadcastData);
                } else {
                    socket.to(roomName).emit('card-updated', broadcastData);
                }

                // Send individual notification to the assignee if they are connected
                if (assigneeUser && assigneeSocketId) {
                    io.to(assigneeSocketId).emit('personal-notification', {
                        type: 'assigned-to-you',
                        message: `You have been assigned to card "${cardTitle}" on ${boardTitle} by ${assignerUsername}`,
                        cardId,
                        cardTitle,
                        assignerUsername,
                        boardTitle,
                        timestamp: new Date()
                    });
                    console.log(`Personal notification sent to ${assigneeUsername} (${assigneeSocketId})`);
                }

                console.log(`Card "${cardTitle}" assigned to ${assigneeUsername} by ${assignerUsername}`);
            } catch (error) {
                console.error('Error logging card assignment:', error);
            }
        });

        // Handle page version creation
        socket.on('page-version-created', async (data: {
            pageId: number,
            pageTitle: string,
            versionId: number,
            versionNumber: number,
            projectId: string,
            username: string
        }) => {
            const { pageId, pageTitle, versionId, versionNumber, projectId, username } = data;
            const roomName = `project-${projectId}`;

            try {
                // Create log entry
                const userId = socket.data.userId ? parseInt(socket.data.userId) : null;
                if (userId && !isNaN(userId)) {
                    await client.log.create({
                        data: {
                            message: `${username} created version ${versionNumber} for page "${pageTitle}"`,
                            docId: pageId,
                            projectid: parseInt(projectId),
                            userId: userId,
                            createdByUserId: userId
                        }
                    });
                } else {
                    console.warn('Cannot create log: userId is invalid or missing');
                }

                // Broadcast to other users in the room
                const broadcastData = {
                    type: 'page-version-created',
                    pageId,
                    pageTitle,
                    versionId,
                    versionNumber,
                    username,
                    timestamp: new Date()
                };

                socket.to(roomName).emit('page-updated', broadcastData);

                console.log(`Page version ${versionNumber} created for "${pageTitle}" by ${username}`);
            } catch (error) {
                console.error('Error logging page version creation:', error);
            }
        });

        // Handle disconnect
        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);

            // Remove user from connections tracking
            if (socket.data.userId) {
                userConnections.delete(socket.data.userId);
            }

            // If user was in a project room, notify others
            if (socket.data.projectId) {
                const roomName = `project-${socket.data.projectId}`;
                socket.to(roomName).emit('user-left', {
                    socketId: socket.id,
                    userId: socket.data.userId,
                    timestamp: new Date()
                });
            }
        });
    });
};