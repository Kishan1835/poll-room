'use client'

/**
 * Generate a browser fingerprint based on available browser characteristics
 * This is used as one of our anti-abuse mechanisms. Client-only (uses window, navigator, document).
 */
export function generateFingerprint(): string {
    const components: string[] = []

    // Screen resolution
    components.push(`${window.screen.width}x${window.screen.height}`)
    components.push(`${window.screen.colorDepth}`)

    // Timezone
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone)

    // Language
    components.push(navigator.language)

    // Platform
    components.push(navigator.platform)

    // Hardware concurrency
    components.push(String(navigator.hardwareConcurrency || 'unknown'))

    // Device memory (if available)
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    if (deviceMemory) {
        components.push(String(deviceMemory))
    }

    // User agent
    components.push(navigator.userAgent)

    // Canvas fingerprinting (lightweight version)
    try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.textBaseline = 'top'
            ctx.font = '14px Arial'
            ctx.fillText('fingerprint', 2, 2)
            components.push(canvas.toDataURL().slice(-50))
        }
    } catch (e) {
        // Canvas fingerprinting blocked or failed
    }

    // Create hash
    const fingerprint = components.join('|')
    return hashString(fingerprint)
}

/**
 * Simple string hash function
 */
function hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
}

/**
 * Store fingerprint in localStorage for consistency across page loads
 */
export function getOrCreateFingerprint(): string {
    const STORAGE_KEY = 'poll_fingerprint'

    if (typeof window === 'undefined') {
        return 'server'
    }

    try {
        let fingerprint = localStorage.getItem(STORAGE_KEY)

        if (!fingerprint) {
            fingerprint = generateFingerprint()
            localStorage.setItem(STORAGE_KEY, fingerprint)
        }

        return fingerprint
    } catch (e) {
        // localStorage not available, generate ephemeral fingerprint
        return generateFingerprint()
    }
}