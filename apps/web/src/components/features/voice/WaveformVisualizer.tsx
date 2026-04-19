"use client"

import { useEffect, useRef } from "react"

interface Props {
  analyser: AnalyserNode
  active: boolean
}

export function WaveformVisualizer({ analyser, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const bufLen = analyser.frequencyBinCount
    const data = new Uint8Array(bufLen)

    const accent = getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#e5001a"
    const idle = getComputedStyle(document.documentElement).getPropertyValue("--color-waveform-idle").trim() || "#777169"

    const draw = () => {
      if (!active) return
      rafRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(data)

      const W = canvas.width
      const H = canvas.height
      ctx.clearRect(0, 0, W, H)

      ctx.lineWidth = 2
      ctx.strokeStyle = active ? accent : idle
      ctx.beginPath()

      const sliceW = W / bufLen
      let x = 0
      for (let i = 0; i < bufLen; i++) {
        const v = (data[i] ?? 128) / 128
        const y = (v * H) / 2
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
        x += sliceW
      }
      ctx.lineTo(W, H / 2)
      ctx.stroke()
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [analyser, active])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={64}
      className="waveform-canvas rounded-[var(--radius-md)]"
      style={{ background: "var(--color-surface-1)" }}
    />
  )
}
