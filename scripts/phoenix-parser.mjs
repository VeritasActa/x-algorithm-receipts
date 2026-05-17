const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?`;
const PHOENIX_RANK_ROW = new RegExp(
  String.raw`^\s*(\d+)\s+(${NUMBER})\s+(${NUMBER})\s+(${NUMBER})\s+(${NUMBER})\s+(${NUMBER})\s+(${NUMBER})\s+(${NUMBER})\s+(.+?)\s+(https?:\/\/\S+)\s*$`,
);

export function parsePhoenixRankingOutput(stdout) {
  const rows = [];
  const lines = String(stdout || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const match = PHOENIX_RANK_ROW.exec(line);
    if (!match) continue;

    const [
      ,
      rank,
      score,
      retrievalScore,
      favoriteProbability,
      replyProbability,
      repostProbability,
      dwellProbability,
      vqvScore,
      topicsText,
      postUrl,
    ] = match;

    rows.push({
      rank: Number(rank),
      post_url: postUrl,
      post_id: extractPostId(postUrl),
      score: Number(score),
      retrieval_score: Number(retrievalScore),
      favorite_probability: Number(favoriteProbability),
      reply_probability: Number(replyProbability),
      repost_probability: Number(repostProbability),
      dwell_probability: Number(dwellProbability),
      vqv_score: Number(vqvScore),
      topics: parseTopics(topicsText),
    });
  }

  return rows;
}

export function buildStdoutLineItems(stdout) {
  return String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => ({ index, line }));
}

function parseTopics(topicsText) {
  const text = String(topicsText || '').trim();
  if (!text || text === '-') return [];
  return text.split(',').map((topic) => topic.trim()).filter(Boolean);
}

function extractPostId(postUrl) {
  const match = /\/status\/(\d+)/.exec(String(postUrl || ''));
  return match ? match[1] : null;
}
