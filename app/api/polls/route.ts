import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { nanoid } from 'nanoid'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { question, options } = body

        // Validation
        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return NextResponse.json(
                { error: 'Question is required' },
                { status: 400 }
            )
        }

        if (!Array.isArray(options) || options.length < 2) {
            return NextResponse.json(
                { error: 'At least 2 options are required' },
                { status: 400 }
            )
        }

        // Validate all options are non-empty strings
        const validOptions = options.filter(
            (opt) => typeof opt === 'string' && opt.trim().length > 0
        )

        if (validOptions.length < 2) {
            return NextResponse.json(
                { error: 'At least 2 valid options are required' },
                { status: 400 }
            )
        }

        // Limit options to prevent abuse
        if (validOptions.length > 10) {
            return NextResponse.json(
                { error: 'Maximum 10 options allowed' },
                { status: 400 }
            )
        }

        // Create poll with short ID for friendly URLs
        const poll = await prisma.poll.create({
            data: {
                id: nanoid(10), // Generate short, URL-friendly ID
                question: question.trim(),
                options: validOptions.map((opt) => opt.trim()),
            },
        })

        return NextResponse.json({
            id: poll.id,
            question: poll.question,
            options: poll.options,
            shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/poll/${poll.id}`,
        })
    } catch (error) {
        console.error('Error creating poll:', error)
        return NextResponse.json(
            { error: 'Failed to create poll' },
            { status: 500 }
        )
    }
}
