/**
 * YouTube Data API v3 스크래퍼
 * Shorts 트렌드 요리 영상 수집
 * API 문서: https://developers.google.com/youtube/v3/docs/search/list
 */
const axios = require('axios');
const logger = require('../db/logger');

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

// 요리 관련 트렌드 검색 키워드
const TREND_KEYWORDS = [
  '요즘 유행 레시피',
  '쉬운 레시피 shorts',
  '요리 shorts',
  '인기 레시피',
  '요즘 뜨는 요리',
  '따라하기 쉬운 요리',
  '집밥 레시피',
  '간단 요리 레시피',
];

/**
 * YouTube에서 요리 관련 Shorts/영상 검색
 * @param {string} query
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
async function searchYouTube(query, maxResults = 50) {
  try {
    const response = await axios.get(YOUTUBE_API_URL, {
      params: {
        key: process.env.YOUTUBE_API_KEY,
        q: query,
        part: 'snippet',
        type: 'video',
        maxResults,
        order: 'date',         // 최신순
        regionCode: 'KR',
        relevanceLanguage: 'ko',
        videoDuration: 'short', // Shorts (4분 이내)
        publishedAfter: getYesterdayISO(), // 어제 이후 게시된 것
      },
    });

    const items = response.data.items || [];
    logger.debug(`[YouTube] "${query}" 검색 결과: ${items.length}개`);

    return items.map(item => ({
      platform: 'youtube',
      videoId: item.id.videoId,
      title: item.snippet.title,
      description: item.snippet.description?.slice(0, 500) || '',
      channelTitle: item.snippet.channelTitle,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      publishedAt: item.snippet.publishedAt,
    }));
  } catch (err) {
    logger.error(`[YouTube] 검색 실패: "${query}"`, { error: err.message });
    return [];
  }
}

/**
 * 영상 통계 정보 가져오기 (조회수, 좋아요 수)
 * @param {string[]} videoIds
 * @returns {Promise<Object>} videoId -> stats 맵
 */
async function getVideoStats(videoIds) {
  if (!videoIds.length) return {};

  try {
    const response = await axios.get(YOUTUBE_VIDEOS_URL, {
      params: {
        key: process.env.YOUTUBE_API_KEY,
        id: videoIds.join(','),
        part: 'statistics',
      },
    });

    const statsMap = {};
    for (const item of response.data.items || []) {
      statsMap[item.id] = {
        viewCount: parseInt(item.statistics.viewCount || 0),
        likeCount: parseInt(item.statistics.likeCount || 0),
        commentCount: parseInt(item.statistics.commentCount || 0),
      };
    }
    return statsMap;
  } catch (err) {
    logger.error('[YouTube] 통계 조회 실패', { error: err.message });
    return {};
  }
}

/**
 * 오늘자 요리 YouTube 영상 전체 수집
 * 제목에서 요리 이름 추출 목적
 * @returns {Promise<Array>}
 */
async function collectTodayRecipes() {
  logger.info('[YouTube] 영상 수집 시작...');
  const allResults = [];

  for (const keyword of TREND_KEYWORDS) {
    const results = await searchYouTube(keyword);
    allResults.push(...results);
    await sleep(500); // API quota 보호
  }

  // 중복 제거
  const unique = deduplicateByVideoId(allResults);

  // 조회수 높은 영상만 통계 가져오기 (상위 50개)
  const top50 = unique.slice(0, 50);
  const videoIds = top50.map(v => v.videoId).filter(Boolean);
  const statsMap = await getVideoStats(videoIds);

  // 통계 병합
  for (const video of top50) {
    if (statsMap[video.videoId]) {
      video.stats = statsMap[video.videoId];
    }
  }

  logger.info(`[YouTube] 수집 완료: ${unique.length}개 (중복 제거 후)`);
  return unique;
}

// ─── 헬퍼 ────────────────────────────────────────────────────

function getYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}

function deduplicateByVideoId(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.videoId || item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { collectTodayRecipes, searchYouTube };
