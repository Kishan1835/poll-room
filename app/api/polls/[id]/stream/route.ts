import { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

// Store active connections for each poll
const connections = new Map<string, Set<ReadableStreamDefaultController>>()

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: pollId } = await params

    // Verify if poll exists
    const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        select: { id: true },
    })

    if (!poll) {
        return new Response('Poll not found', { status: 404 })
    }

    // Createreadable stream for SSE
    const stream = new ReadableStream({
        start(controller) {
            // Add this connection to the pool
            if (!connections.has(pollId)) {
                connections.set(pollId, new Set())
            }
            connections.get(pollId)!.add(controller)

            // Send initial connection mess
            const data = `data: ${JSON.stringify({ type: 'connected' })}\n\n`
            controller.enqueue(new TextEncoder().encode(data))

            // Send current poll data
            sendPollUpdate(pollId, controller)

            // Heartbeat to keep connection alive
            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'))
                } catch (e) {
                    clearInterval(heartbeat)
                }
            }, 30000)

            // Cleanup on connection close
            request.signal.addEventListener('abort', () => {
                clearInterval(heartbeat)
                const pollConnections = connections.get(pollId)
                if (pollConnections) {
                    pollConnections.delete(controller)
                    if (pollConnections.size === 0) {
                        connections.delete(pollId)
                    }
                }
                try {
                    controller.close()
                } catch (e) {
                    // if already closed
                }
            })
        },
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    })
}

async function sendPollUpdate(
    pollId: string,
    controller: ReadableStreamDefaultController
) {
    try {
        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: {
                votes: {
                    select: { optionIndex: true },
                },
            },
        })

        if (!poll) return

        const voteCounts = new Array(poll.options.length).fill(0)
        poll.votes.forEach((vote) => {
            if (vote.optionIndex >= 0 && vote.optionIndex < poll.options.length) {
                voteCounts[vote.optionIndex]++
            }
        })

        const message = {
            type: 'update',
            voteCounts,
            totalVotes: poll.votes.length,
        }

        const data = `data: ${JSON.stringify(message)}\n\n`
        controller.enqueue(new TextEncoder().encode(data))
    } catch (e) {
        console.error('Error sending poll update:', e)
    }
}

// broadcasting updates to all connected clients
export async function broadcastPollUpdate(pollId: string) {
    const pollConnections = connections.get(pollId)
    if (!pollConnections || pollConnections.size === 0) return

    const poll = await prisma.poll.findUnique({
        where: { id: pollId },
        include: {
            votes: {
                select: { optionIndex: true },
            },
        },
    })

    if (!poll) return

    const voteCounts = new Array(poll.options.length).fill(0)
    poll.votes.forEach((vote) => {
        if (vote.optionIndex >= 0 && vote.optionIndex < poll.options.length) {
            voteCounts[vote.optionIndex]++
        }
    })

    const message = {
        type: 'update',
        voteCounts,
        totalVotes: poll.votes.length,
    }

    const data = `data: ${JSON.stringify(message)}\n\n`
    const encodedData = new TextEncoder().encode(data)

    // Send to all connected clients
    pollConnections.forEach((controller) => {
        try {
            controller.enqueue(encodedData)
        } catch (e) {
            // Connection closed, will be cleaned up
            pollConnections.delete(controller)
        }
    })
}