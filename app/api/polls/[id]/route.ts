import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: pollId } = await params

        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            include: {
                votes: {
                    select: {
                        optionIndex: true,
                    },
                },
            },
        })

        if (!poll) {
            return NextResponse.json(
                { error: 'Poll not found' },
                { status: 404 }
            )
        }

        // Calculate vote counts for each option
        const voteCounts = new Array(poll.options.length).fill(0)
        poll.votes.forEach((vote) => {
            if (vote.optionIndex >= 0 && vote.optionIndex < poll.options.length) {
                voteCounts[vote.optionIndex]++
            }
        })

        const totalVotes = poll.votes.length

        return NextResponse.json({
            id: poll.id,
            question: poll.question,
            options: poll.options,
            voteCounts,
            totalVotes,
            createdAt: poll.createdAt,
        })
    } catch (error) {
        console.error('Error fetching poll:', error)
        return NextResponse.json(
            { error: 'Failed to fetch poll' },
            { status: 500 }
        )
    }
}
