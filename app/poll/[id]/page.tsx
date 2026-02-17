"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import toast, { Toaster } from "react-hot-toast";
import { getOrCreateFingerprint } from "@/lib/fingerprint";

interface PollData {
  id: string;
  question: string;
  options: string[];
  voteCounts: number[];
  totalVotes: number;
  createdAt: string;
}

export default function PollPage() {
  const params = useParams();
  const router = useRouter();
  const pollId = params.id as string;

  const [poll, setPoll] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Fetch initial poll data
  const fetchPoll = useCallback(async () => {
    try {
      const response = await fetch(`/api/polls/${pollId}`);

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Poll not found");
          router.push("/");
          return;
        }
        throw new Error("Failed to fetch poll");
      }

      const data = await response.json();
      setPoll(data);

      // Set share URL
      if (typeof window !== "undefined") {
        setShareUrl(window.location.href);
      }
    } catch (error) {
      toast.error("Failed to load poll");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [pollId, router]);

  // Set up real-time updates with SSE
  useEffect(() => {
    fetchPoll();

    // Connect to SSE endpoint
    const eventSource = new EventSource(`/api/polls/${pollId}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "update") {
          setPoll((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              voteCounts: data.voteCounts,
              totalVotes: data.totalVotes,
            };
          });
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (event) => {
      // EventSource error event doesn't provide detailed error info
      // Check readyState to understand connection status
      if (eventSource.readyState === EventSource.CLOSED) {
        console.error("SSE connection closed");
        // Only attempt to reconnect if connection was closed (not just connecting)
        // EventSource will automatically try to reconnect for CONNECTING state
        setTimeout(() => {
          fetchPoll();
        }, 5000);
      }
      // For CONNECTING state, EventSource will automatically retry
      // so we don't need to manually reconnect all the time
    };

    return () => {
      eventSource.close();
    };
  }, [pollId, fetchPoll]);

  const handleVote = async (optionIndex: number) => {
    if (hasVoted || voting) return;

    setVoting(true);
    setSelectedOption(optionIndex);

    try {
      const fingerprint = getOrCreateFingerprint();

      const response = await fetch(`/api/polls/${pollId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          optionIndex,
          fingerprint,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to vote");
      }

      setHasVoted(true);
      toast.success("Vote recorded!");

      // Update local state immediately
      setPoll((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          voteCounts: data.voteCounts,
          totalVotes: data.totalVotes,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to vote";
      toast.error(message);

      // If already voted error, mark as voted
      if (message.includes("already voted")) {
        setHasVoted(true);
      }
    } finally {
      setVoting(false);
    }
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const getPercentage = (count: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading poll...</p>
        </div>
      </div>
    );
  }

  if (!poll) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Toaster position="top-center" />

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4"
          >
            ← Create New Poll
          </button>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            {poll.question}
          </h1>
          <p className="text-gray-600">
            {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
          </p>
        </div>

        {/* Share Link */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={copyShareLink}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Poll Options */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="space-y-4">
            {poll.options.map((option, index) => {
              const voteCount = poll.voteCounts[index] || 0;
              const percentage = getPercentage(voteCount, poll.totalVotes);
              const isSelected = selectedOption === index;

              return (
                <button
                  key={index}
                  onClick={() => handleVote(index)}
                  disabled={hasVoted || voting}
                  className={`w-full text-left relative overflow-hidden rounded-xl border-2 transition-all ${
                    hasVoted || voting
                      ? "cursor-not-allowed"
                      : "hover:border-blue-400 cursor-pointer"
                  } ${
                    isSelected && hasVoted
                      ? "border-blue-600"
                      : "border-gray-200"
                  }`}
                >
                  {/* Progress bar */}
                  <div
                    className={`absolute inset-0 transition-all duration-500 ${
                      isSelected && hasVoted ? "bg-blue-100" : "bg-gray-100"
                    }`}
                    style={{ width: `${percentage}%` }}
                  />

                  {/* Content */}
                  <div className="relative px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          isSelected && hasVoted
                            ? "border-blue-600 bg-blue-600"
                            : "border-gray-400"
                        }`}
                      >
                        {isSelected && hasVoted && (
                          <span className="text-white text-sm">✓</span>
                        )}
                      </div>
                      <span className="font-medium text-gray-900">
                        {option}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600">
                        {voteCount} {voteCount === 1 ? "vote" : "votes"}
                      </span>
                      <span className="font-bold text-gray-900 min-w-[3rem] text-right">
                        {percentage}%
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {hasVoted && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-green-800 font-medium">
                ✓ Your vote has been recorded
              </p>
              <p className="text-green-600 text-sm mt-1">
                Results update automatically as others vote
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            Results update in real-time • Share the link to collect more votes
          </p>
        </div>
      </div>
    </div>
  );
}
