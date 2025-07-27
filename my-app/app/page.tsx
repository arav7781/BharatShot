"use client"
import type React from "react"
import { useState, useRef, useEffect } from "react"
import {
  Upload,
  Send,
  Zap,
  Brain,
  Video,
  Sparkles,
  Download,
  AlertTriangle,
  CheckCircle,
  Activity,
  BarChart3,
  Target,
  Shield,
  TrendingUp,
  Clock,
  Award,
  Flame,
} from "lucide-react"

interface Message {
  role: string
  content: string
  video?: string
}

interface OutputVideo {
  path: string
  url: string
  message: string
  size: number
}

interface IntermediateOutput {
  thought: string
  code: string
  output: string
  operation_type?: string
}

interface AnalysisResults {
  output_video_path: string
  frame_data: Array<{
    frame: number
    injury_risk: {
      back: string
      knees: string
      shoulders: string
    }
    analysis: {
      back?: string
      knees?: string
      shoulders?: string
      swing_speed?: string
      [key: string]: any
    }
  }>
  exercises: Array<{
    exercise: string
    description: string
  }>
  max_injury_risk: {
    back: string
    knees: string
    shoulders: string
  }
  total_frames: number
  video_exists: boolean
  video_size: number
}

const CricketBiomechanicsAI: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null)
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null)
  const [processedVideoUrl, setProcessedVideoUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [analysisComplete, setAnalysisComplete] = useState<boolean>(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleVideoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0] && !isUploading) {
      const file = event.target.files[0]
      setIsUploading(true)
      setSelectedVideo(file)
      setError(null)
      setAnalysisResults(null)
      setMessages([])
      setAnalysisComplete(false)
      setProcessedVideoUrl(null)

      const formData = new FormData()
      formData.append("video", file)

      try {
        setLoading(true)
        const response = await fetch("http://localhost:5001/upload", {
          method: "POST",
          body: formData,
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || "Upload failed")
        }

        setVideoPath(data.video_path)
        setMessages([
          {
            role: "system",
            content: `✅ Video uploaded successfully! File: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)\nReady for biomechanical analysis. Try: "analyze batting posture" or "assess injury risk"`,
          },
        ])
      } catch (err: any) {
        setError(err.message || "Failed to upload video")
        console.error("Upload error:", err)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
        setSelectedVideo(null)
      } finally {
        setLoading(false)
        setIsUploading(false)
      }
    }
  }

  const handleDownloadVideo = async () => {
    if (!processedVideoUrl) return

    try {
      const response = await fetch(processedVideoUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      link.download = `cricket-analysis-${timestamp}.mp4`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Download failed:", error)
      setError("Failed to download video")
    }
  }

  const resetForNewVideo = () => {
    setSelectedVideo(null)
    setVideoPath(null)
    setMessages([])
    setAnalysisResults(null)
    setProcessedVideoUrl(null)
    setAnalysisComplete(false)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSendMessage = async () => {
    if (!input.trim()) {
      setError("Please enter a message")
      return
    }

    if (!videoPath) {
      setError("Please upload a video first")
      return
    }

    if (analysisComplete) {
      setError("Analysis complete. Please upload a new video to continue.")
      return
    }

    const userMessage: Message = { role: "user", content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("http://localhost:5001/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: input,
          video_path: videoPath,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || data.details || "Processing failed")
      }

      console.log("Chat response:", data)
      const newMessages: Message[] = [userMessage]

      // Handle intermediate outputs
      if (data.intermediate_outputs && Array.isArray(data.intermediate_outputs)) {
        data.intermediate_outputs.forEach((output: IntermediateOutput) => {
          if (output.thought) {
            newMessages.push({
              role: "assistant",
              content: `🧠 **Analysis Process**: ${output.thought}`,
            })
          }
          if (output.output) {
            newMessages.push({
              role: "assistant",
              content: output.output,
            })
          }
        })
      }

      // Handle output video
      if (data.output_video && data.output_video.url) {
        setProcessedVideoUrl(data.output_video.url)
        newMessages.push({
          role: "assistant",
          content: `🎥 **Processed Video Ready**: ${data.output_video.message}`,
          video: data.output_video.url,
        })
      }

      // Handle analysis results
      if (data.analysis_results && Object.keys(data.analysis_results).length > 0) {
        setAnalysisResults(data.analysis_results)
        setAnalysisComplete(true)
        if (data.analysis_results.output_video_path && !processedVideoUrl) {
          const videoUrl = `http://localhost:5001/video/${data.analysis_results.output_video_path}`
          setProcessedVideoUrl(videoUrl)
          const hasVideoMessage = newMessages.some((msg) => msg.video)
          if (!hasVideoMessage) {
            newMessages.push({
              role: "assistant",
              content: "🎥 **Analysis Complete**: Annotated video with pose estimation and injury risk assessment",
              video: videoUrl,
            })
          }
        }
      }

      // Handle messages
      if (data.messages && Array.isArray(data.messages)) {
        data.messages.forEach((msg: any) => {
          if (msg && msg.role === "assistant" && msg.content) {
            try {
              if (msg.content.startsWith("[")) {
                const parsed = JSON.parse(msg.content)
                if (Array.isArray(parsed) && parsed.length > 0) {
                  const result = parsed[0]
                  const state = parsed[1]
                  if (state.intermediate_outputs) {
                    state.intermediate_outputs.forEach((output: IntermediateOutput) => {
                      if (output.thought) {
                        newMessages.push({
                          role: "assistant",
                          content: `🧠 **Analysis Process**: ${output.thought}`,
                        })
                      }
                      if (output.output) {
                        newMessages.push({
                          role: "assistant",
                          content: output.output,
                        })
                      }
                    })
                  }
                  if (state.output_video_path) {
                    const videoUrl = `http://localhost:5001/video/${state.output_video_path}`
                    setProcessedVideoUrl(videoUrl)
                    const hasVideoMessage = newMessages.some((msg) => msg.video)
                    if (!hasVideoMessage) {
                      newMessages.push({
                        role: "assistant",
                        content:
                          "🎥 **Analysis Complete**: Annotated video with pose estimation and injury risk assessment",
                        video: videoUrl,
                      })
                    }
                  }
                  if (state.analysis_results) {
                    setAnalysisResults(state.analysis_results)
                    setAnalysisComplete(true)
                  }
                }
              } else {
                newMessages.push({
                  role: "assistant",
                  content: msg.content,
                  video: msg.video,
                })
              }
            } catch (e) {
              console.error("Error parsing message content:", e)
              newMessages.push({
                role: "assistant",
                content: msg.content,
                video: msg.video,
              })
            }
          }
        })
      }

      setMessages((prev) => [...prev, ...newMessages.slice(1)])
    } catch (err: any) {
      console.error("Chat error:", err)
      const errorMessage = err.message || "An error occurred during processing"
      setError(errorMessage)
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `❌ **Error**: ${errorMessage}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const getRiskColor = (risk: string): string => {
    switch (risk?.toLowerCase()) {
      case "high":
        return "text-red-700 bg-gradient-to-r from-red-50 to-red-100 border-red-300 shadow-red-100"
      case "moderate":
        return "text-amber-700 bg-gradient-to-r from-amber-50 to-yellow-100 border-amber-300 shadow-amber-100"
      case "low":
        return "text-emerald-700 bg-gradient-to-r from-emerald-50 to-green-100 border-emerald-300 shadow-emerald-100"
      default:
        return "text-slate-700 bg-gradient-to-r from-slate-50 to-gray-100 border-slate-300 shadow-slate-100"
    }
  }

  const getRiskIcon = (risk: string) => {
    switch (risk?.toLowerCase()) {
      case "high":
        return <AlertTriangle className="w-5 h-5 text-red-600" />
      case "moderate":
        return <Activity className="w-5 h-5 text-amber-600" />
      case "low":
        return <CheckCircle className="w-5 h-5 text-emerald-600" />
      default:
        return <CheckCircle className="w-5 h-5 text-slate-600" />
    }
  }

  const renderMessageContent = (message: Message) => {
    const { content } = message
    if (content.includes("**")) {
      const parts = content.split("**")
      return parts.map((part, index) =>
        index % 2 === 1 ? (
          <strong key={index} className="font-bold text-emerald-700">
            {part}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )
    }
    return content
  }

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 text-gray-800 relative overflow-hidden">
      {/* Professional Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(59,130,246,0.1) 1px, transparent 1px),
            linear-gradient(0deg, rgba(99,102,241,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)
          `,
            backgroundSize: "50px 50px, 100px 100px, 100px 100px",
          }}
        />
      </div>

      {/* Animated Professional Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-32 h-32 bg-gradient-to-br from-blue-200 to-indigo-300 rounded-full opacity-20 animate-pulse" />
        <div
          className="absolute top-40 right-32 w-24 h-24 bg-gradient-to-br from-purple-200 to-blue-300 rounded-full opacity-15 animate-bounce"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-32 left-40 w-28 h-28 bg-gradient-to-br from-cyan-200 to-blue-300 rounded-full opacity-20 animate-pulse"
          style={{ animationDelay: "2s" }}
        />
        <div
          className="absolute bottom-20 right-20 w-36 h-36 bg-gradient-to-br from-indigo-200 to-purple-300 rounded-full opacity-15 animate-bounce"
          style={{ animationDelay: "0.5s" }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center p-6 space-y-8">
        {/* Header Section */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-8xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 bg-clip-text text-transparent mb-4 tracking-tight leading-none">
            BharatShot
            </h1>
            <h2 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-700 bg-clip-text text-transparent tracking-wide mb-6">
              BIOMECHANICS AI
            </h2>
          </div>

          <p className="text-2xl text-slate-600 font-light mb-6">
            Master Your Batting Technique with AI-Powered Analysis
          </p>

          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-200 shadow-sm">
              <Target className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-slate-700">Precision Analysis</span>
            </div>
            <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-purple-200 shadow-sm">
              <Shield className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-slate-700">Injury Prevention</span>
            </div>
            <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-4 py-2 rounded-full border border-indigo-200 shadow-sm">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <span className="text-sm font-medium text-slate-700">Performance Boost</span>
            </div>
          </div>

          <div className="w-32 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-600 mx-auto rounded-full shadow-lg" />
        </div>

        {/* Video Upload Section */}
        <div className="w-full max-w-7xl">
          <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500 hover:bg-white/95">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl blur-md opacity-20 animate-pulse" />
                  <div className="relative p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg">
                    <Upload className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-slate-800 mb-1">Upload Cricket Video</h2>
                  <p className="text-slate-600">Upload your batting video for AI-powered biomechanical analysis</p>
                </div>
              </div>

              {analysisComplete && (
                <button
                  onClick={resetForNewVideo}
                  className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-purple-600 hover:to-indigo-700 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    New Analysis
                  </div>
                </button>
              )}
            </div>

            <div className="relative group">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoChange}
                className="w-full p-8 border-3 border-dashed border-blue-300 rounded-2xl bg-blue-50/50 text-slate-700 file:mr-6 file:py-4 file:px-8 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-blue-500 file:to-indigo-600 file:text-white file:font-semibold hover:file:from-blue-600 hover:file:to-indigo-700 transition-all duration-300 hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 group-hover:shadow-xl"
                disabled={loading || isUploading}
              />

              {(loading || isUploading) && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                  <div className="flex items-center gap-4 bg-white/90 backdrop-blur-sm px-8 py-4 rounded-xl border border-slate-200 shadow-lg">
                    <div className="animate-spin rounded-full h-8 w-8 border-3 border-blue-500 border-t-transparent"></div>
                    <span className="text-slate-700 font-semibold text-lg">
                      {isUploading ? "Uploading Video..." : "Processing..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Original Video Display */}
          {selectedVideo && (
            <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 shadow-xl mt-8 hover:shadow-2xl transition-all duration-500">
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl blur-md opacity-20" />
                  <div className="relative p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl shadow-lg">
                    <Video className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-slate-800 mb-1">Original Video</h2>
                  <p className="text-slate-600">Your uploaded batting video ready for analysis</p>
                </div>
              </div>

              <div className="flex justify-center">
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl blur-lg opacity-20 group-hover:opacity-30 transition-opacity duration-300" />
                  <video
                    src={URL.createObjectURL(selectedVideo)}
                    controls
                    className="relative max-w-full max-h-96 rounded-2xl shadow-xl object-cover border-2 border-slate-200 group-hover:border-slate-300 transition-all duration-300"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Analysis Results */}
        {analysisResults && (
          <div className="w-full max-w-7xl bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-all duration-500">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-2xl blur-md opacity-20 animate-pulse" />
                  <div className="relative p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl shadow-lg">
                    <BarChart3 className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-slate-800 mb-1">Analysis Results</h3>
                  <p className="text-slate-600">Comprehensive biomechanical assessment</p>
                </div>
              </div>

              {processedVideoUrl && (
                <button
                  onClick={handleDownloadVideo}
                  className="flex items-center gap-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-3 rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <Download className="w-5 h-5" />
                  Download Analysis
                </button>
              )}
            </div>

            {/* Risk Assessment Cards */}
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {Object.entries(analysisResults.max_injury_risk).map(([joint, risk]) => (
                <div
                  key={joint}
                  className={`p-6 rounded-2xl border-2 shadow-lg ${getRiskColor(risk)} backdrop-blur-sm hover:scale-105 transition-all duration-300`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {getRiskIcon(risk)}
                    <h4 className="font-bold text-xl capitalize">{joint}</h4>
                  </div>
                  <p className="text-2xl font-black mb-2">{risk} Risk</p>
                  <div className="w-full bg-white/30 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-1000 ${
                        risk?.toLowerCase() === "high"
                          ? "bg-red-500 w-5/6"
                          : risk?.toLowerCase() === "moderate"
                            ? "bg-amber-500 w-3/5"
                            : "bg-emerald-500 w-2/5"
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Stats Grid */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-200 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-6 h-6 text-blue-600" />
                  <h4 className="font-bold text-blue-800 text-lg">Analysis Summary</h4>
                </div>
                <div className="space-y-2">
                  <p className="text-blue-700">
                    Frames Processed: <span className="font-bold text-slate-800">{analysisResults.total_frames}</span>
                  </p>
                  <p className="text-blue-700">
                    Video Size:{" "}
                    <span className="font-bold text-slate-800">
                      {(analysisResults.video_size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-2xl border border-purple-200 backdrop-blur-sm shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Award className="w-6 h-6 text-purple-600" />
                  <h4 className="font-bold text-purple-800 text-lg">Processing Status</h4>
                </div>
                <div className="space-y-2">
                  <p className="text-purple-700">
                    Video Available:{" "}
                    <span className="font-bold text-emerald-600">
                      {analysisResults.video_exists ? "✅ Yes" : "❌ No"}
                    </span>
                  </p>
                  <p className="text-purple-700">
                    Analysis: <span className="font-bold text-emerald-600">✅ Complete</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Exercise Recommendations */}
            {analysisResults.exercises && analysisResults.exercises.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-6">
                  <Flame className="w-8 h-8 text-orange-500" />
                  <h3 className="text-2xl font-bold text-slate-800">Recommended Exercises</h3>
                </div>
                <div className="grid gap-4">
                  {analysisResults.exercises.map((exercise, index) => (
                    <div
                      key={index}
                      className="bg-gradient-to-r from-orange-50 to-red-50 p-6 rounded-2xl border border-orange-200 backdrop-blur-sm hover:scale-102 transition-all duration-300 shadow-sm"
                    >
                      <h4 className="font-bold text-orange-800 text-lg mb-3">{exercise.exercise}</h4>
                      <p className="text-orange-700 leading-relaxed">{exercise.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Frame Analysis */}
            {analysisResults.frame_data && analysisResults.frame_data.length > 0 && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <BarChart3 className="w-8 h-8 text-cyan-600" />
                  <h3 className="text-2xl font-bold text-slate-800">Frame Analysis (Last 5 Frames)</h3>
                </div>
                <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
                  {analysisResults.frame_data.slice(-5).map((frame, index) => (
                    <div
                      key={index}
                      className="bg-slate-50/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-200 hover:bg-slate-50 transition-all duration-300 shadow-sm"
                    >
                      <h4 className="font-bold text-slate-800 text-lg mb-4">Frame {frame.frame}</h4>
                      <div className="grid md:grid-cols-3 gap-4 text-sm">
                        <div className={`p-4 rounded-xl ${getRiskColor(frame.injury_risk.back)} backdrop-blur-sm`}>
                          <strong className="block mb-2">Back:</strong>
                          <span className="text-lg font-bold">{frame.injury_risk.back}</span>
                          {frame.analysis.back && <p className="text-xs mt-2 opacity-80">{frame.analysis.back}</p>}
                        </div>
                        <div className={`p-4 rounded-xl ${getRiskColor(frame.injury_risk.knees)} backdrop-blur-sm`}>
                          <strong className="block mb-2">Knees:</strong>
                          <span className="text-lg font-bold">{frame.injury_risk.knees}</span>
                          {frame.analysis.knees && <p className="text-xs mt-2 opacity-80">{frame.analysis.knees}</p>}
                        </div>
                        <div className={`p-4 rounded-xl ${getRiskColor(frame.injury_risk.shoulders)} backdrop-blur-sm`}>
                          <strong className="block mb-2">Shoulders:</strong>
                          <span className="text-lg font-bold">{frame.injury_risk.shoulders}</span>
                          {frame.analysis.shoulders && (
                            <p className="text-xs mt-2 opacity-80">{frame.analysis.shoulders}</p>
                          )}
                        </div>
                      </div>
                      {frame.analysis.swing_speed && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <p className="text-blue-700">
                            <strong>Swing Speed:</strong>{" "}
                            <span className="text-slate-800 font-bold">{frame.analysis.swing_speed}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Chat Interface */}
        <div className="w-full max-w-7xl bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl blur-md opacity-20 animate-pulse" />
                <div className="relative p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                  <Brain className="w-8 h-8 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-slate-800 mb-1">AI Cricket Coach</h3>
                <p className="text-slate-600">Get personalized insights and recommendations</p>
              </div>
            </div>

            {analysisComplete && (
              <div className="flex items-center gap-3 bg-emerald-50 backdrop-blur-sm px-6 py-3 rounded-xl border border-emerald-200 shadow-sm">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Analysis Complete</span>
              </div>
            )}
          </div>

          {/* Chat Messages */}
          <div
            ref={chatContainerRef}
            className="h-80 overflow-y-auto mb-8 p-6 bg-slate-50/50 backdrop-blur-sm rounded-2xl border border-slate-200 custom-scrollbar"
          >
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`mb-6 p-6 rounded-2xl shadow-sm transition-all duration-300 hover:scale-102 ${
                  msg.role === "user"
                    ? "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 ml-8"
                    : msg.role === "system"
                      ? "bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200"
                      : "bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 mr-8"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  {msg.role === "user" ? (
                    <>
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-blue-700 font-semibold">You</span>
                    </>
                  ) : msg.role === "system" ? (
                    <>
                      <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse"></div>
                      <span className="text-cyan-700 font-semibold">System</span>
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></div>
                      <span className="text-purple-700 font-semibold">AI Coach</span>
                    </>
                  )}
                </div>

                <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">{renderMessageContent(msg)}</div>

                {msg.video && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Video className="w-4 h-4" />
                        Processed Video with Analysis:
                      </p>
                      <button
                        onClick={handleDownloadVideo}
                        className="flex items-center gap-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg transition-all duration-200 border border-blue-200"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl blur-lg opacity-20 group-hover:opacity-30 transition-opacity duration-300" />
                      <video
                        src={msg.video}
                        controls
                        className="relative w-full max-w-md rounded-2xl shadow-xl object-cover border-2 border-slate-200 group-hover:border-slate-300 transition-all duration-300"
                        onError={(e) => {
                          console.error("Video load error:", e)
                          setError("Failed to load processed video")
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="text-center py-8">
                <div className="flex items-center justify-center gap-4 bg-white/90 backdrop-blur-sm px-8 py-4 rounded-xl border border-slate-200 inline-flex shadow-lg">
                  <div className="animate-spin rounded-full h-8 w-8 border-3 border-blue-500 border-t-transparent"></div>
                  <span className="text-slate-700 text-lg font-semibold">AI Processing Video...</span>
                </div>
              </div>
            )}
          </div>

          {/* Input Section */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && !loading && handleSendMessage()}
                className={`w-full p-6 rounded-2xl text-slate-700 border-2 transition-all duration-300 placeholder-slate-400 text-lg ${
                  analysisComplete
                    ? "bg-slate-50 border-slate-200 cursor-not-allowed"
                    : "bg-white border-blue-300 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 backdrop-blur-sm shadow-sm"
                }`}
                placeholder={
                  analysisComplete
                    ? "Upload a new video to continue..."
                    : "Ask your AI cricket coach anything... (e.g., 'analyze my batting stance', 'assess injury risk')"
                }
                disabled={loading || analysisComplete}
              />
              <div className="absolute right-6 top-1/2 transform -translate-y-1/2">
                <Sparkles
                  className={`w-6 h-6 ${analysisComplete ? "text-slate-300" : "text-blue-500 animate-pulse"}`}
                />
              </div>
            </div>

            <button
              onClick={handleSendMessage}
              disabled={loading || !input.trim() || !videoPath || analysisComplete}
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-8 py-6 rounded-2xl disabled:from-slate-400 disabled:to-slate-500 disabled:cursor-not-allowed hover:from-blue-600 hover:to-indigo-700 transition-all duration-300 flex items-center gap-3 shadow-xl hover:shadow-2xl font-semibold text-lg transform hover:scale-105 disabled:hover:scale-100"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
              ) : (
                <Send className="w-6 h-6" />
              )}
              <span>Analyze</span>
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="w-full max-w-7xl bg-red-50 backdrop-blur-sm border border-red-200 text-red-700 px-8 py-6 rounded-2xl shadow-lg">
            <div className="flex items-center gap-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <div>
                <strong className="text-red-800">Error:</strong>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="w-full max-w-7xl bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 shadow-xl">
          <div className="flex items-center gap-4 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl blur-md opacity-20" />
              <div className="relative p-3 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl shadow-lg">
                <Zap className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-slate-800 mb-1">Quick Analysis Commands</h3>
              <p className="text-slate-600">One-click analysis for common assessments</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { text: "analyze batting posture", icon: Target, color: "from-blue-500 to-cyan-600" },
              { text: "assess injury risk", icon: Shield, color: "from-red-500 to-pink-600" },
              { text: "calculate swing speed", icon: TrendingUp, color: "from-emerald-500 to-green-600" },
              { text: "suggest exercises", icon: Activity, color: "from-purple-500 to-indigo-600" },
            ].map((action, index) => (
              <button
                key={action.text}
                onClick={() => !analysisComplete && setInput(action.text)}
                disabled={!videoPath || loading || analysisComplete}
                className={`bg-gradient-to-r ${action.color} hover:scale-105 disabled:from-slate-400 disabled:to-slate-500 disabled:text-slate-300 disabled:hover:scale-100 text-white px-6 py-6 rounded-2xl text-sm transition-all duration-300 border border-white/20 hover:border-white/40 font-semibold shadow-lg hover:shadow-xl flex flex-col items-center gap-3`}
              >
                {action.icon && <action.icon className="w-6 h-6" />}
                <span className="capitalize leading-tight">{action.text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(148, 163, 184, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.7);
        }
        
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 1s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

export default CricketBiomechanicsAI
