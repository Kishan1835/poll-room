import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { broadcastPollUpdate } from '../stream/route'

/**
 * ANTI-ABUSE MECHANISM #1: Fingerprint-based voting prevention
 * ANTI-ABUSE MECHANISM #2: IP-based rate limiting
 */

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const {id:pollId} =  await params
        const body = await request.json()
        const { optionIndex, fingerprint } = body

        // Validation
        if (typeof optionIndex !== 'number' || optionIndex < 0) {
            return NextResponse.json(
                { error: 'Invalid option index' },
                { status: 400 }
            )
        }

        if (!fingerprint || typeof fingerprint !== 'string' || fingerprint === 'server') {
            return NextResponse.json(
                { error: 'Fingerprint is required' },
                { status: 400 }
            )
        }

        // Get IP address from request headers
        const ipAddress =
            request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
            request.headers.get('x-real-ip') ||
            'unknown'

        const userAgent = request.headers.get('user-agent') || 'unknown'

        // Check if poll exists
        const poll = await prisma.poll.findUnique({
            where: { id: pollId },
            select: { id: true, options: true },
        })

        if (!poll) {
            return NextResponse.json(
                { error: 'Poll not found' },
                { status: 404 }
            )
        }

        // Validate option index
        if (optionIndex >= poll.options.length) {
            return NextResponse.json(
                { error: 'Invalid option index' },
                { status: 400 }
            )
        }

        // ANTI-ABUSE MECHANISM #1: Check if this fingerprint has already voted
        const existingVoteByFingerprint = await prisma.vote.findFirst({
            where: {
                pollId,
                fingerprint,
            },
        })

        if (existingVoteByFingerprint) {
            return NextResponse.json(
                { error: 'You have already voted in this poll' },
                { status: 409 }
            )
        }

        // ANTI-ABUSE MECHANISM #2: Check if this IP has voted recently (within 5 minutes)
        // New correction that we have a time limit of 1 min 
        const fiveMinutesAgo = new Date(Date.now() - 60 * 1000)
        const recentVotesByIp = await prisma.vote.findFirst({
            where: {
                pollId,
                ipAddress,
                createdAt: {
                    gte: fiveMinutesAgo,
                },
            },
        })

        if (recentVotesByIp) {
            return NextResponse.json(
                { error: 'Please wait before voting again from this network' },
                { status: 429 }
            )
        }

        // Create the vote
        await prisma.vote.create({
            data: {
                pollId,
                optionIndex,
                fingerprint,
                ipAddress,
                userAgent,
            },
        })

        // Fetch updated vote counts
        const allVotes = await prisma.vote.findMany({
            where: { pollId },
            select: { optionIndex: true },
        })

        const voteCounts = new Array(poll.options.length).fill(0)
        allVotes.forEach((v) => {
            if (v.optionIndex >= 0 && v.optionIndex < poll.options.length) {
                voteCounts[v.optionIndex]++
            }
        })

        // Broadcast update to all connected clients
        broadcastPollUpdate(pollId).catch((e) => {
            console.error('Error broadcasting update:', e)
        })

        return NextResponse.json({
            success: true,
            voteCounts,
            totalVotes: allVotes.length,
        })
    } catch (error) {
        console.error('Error recording vote:', error)
        return NextResponse.json(
            { error: 'Failed to record vote' },
            { status: 500 }
        )
    }
}
