type VoiceLang = "vi" | "en" | "multi"

const VI_PROMPTS = [
  "Xin chào, tôi là thành viên của đội ngũ Demo. Chúng tôi cống hiến để tạo ra những giá trị tốt nhất.",
  "Công nghệ và con người — đây là hai yếu tố cốt lõi trong mọi điều chúng tôi làm tại Demo.",
  "Mỗi ý tưởng tốt đều bắt đầu bằng một cuộc trò chuyện rõ ràng, chân thành và có mục tiêu.",
  "Hôm nay tôi đang đọc đoạn mẫu này bằng giọng tự nhiên, đều nhịp và dễ nghe.",
  "Cảm ơn bạn đã lắng nghe. Chúng tôi rất mong được hợp tác cùng bạn trong tương lai gần.",
]

const EN_PROMPTS = [
  "Hello, I'm part of the Demo team. We are committed to building innovative solutions for our clients.",
  "At Demo, we believe that every great idea starts with a single conversation.",
  "Today I am reading this sample in a natural, steady, and clear speaking voice.",
  "Technology and people are the two core elements behind everything we build.",
  "Thank you for listening. We look forward to working together in the near future.",
]

export function getGuidedPrompts(lang: VoiceLang): string[] {
  if (lang === "vi") return VI_PROMPTS
  if (lang === "en") return EN_PROMPTS
  return [
    "Xin chào, tôi là thành viên của đội ngũ Demo. Chúng tôi cống hiến để tạo ra những giá trị tốt nhất.",
    "Hello, I'm part of the Demo team. We are committed to building innovative solutions for our clients.",
    "Công nghệ và con người — đây là hai yếu tố cốt lõi trong mọi điều chúng tôi làm tại Demo.",
    "At Demo, we believe that every great idea starts with a single conversation.",
    "Cảm ơn bạn đã lắng nghe. Chúng tôi rất mong được hợp tác cùng bạn trong tương lai gần.",
  ]
}
