/**
 * Naver Blog 검색 API 스크래퍼
 * 공식 API: https://developers.naver.com/docs/serviceapi/search/blog/v1/blog.md
 */
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../db/logger');

const NAVER_API_URL = 'https://openapi.naver.com/v1/search/blog.json';

// 레시피 관련 트렌드 키워드 목록 (주기적으로 확장 가능)
const TREND_KEYWORDS = [
  '요즘 유행 레시피',
  '요즘 핫한 음식',
  '최신 레시피 트렌드',
  '인스타 요리',
  '유행 요리',
  '요즘 뜨는 레시피',
  '2024 트렌드 음식',
  '핫플 음식 만들기',
];

/**
 * 네이버 블로그에서 레시피 관련 포스팅 검색
 * @param {string} query - 검색 키워드
 * @param {number} display - 결과 수 (최대 100)
 * @returns {Promise<Array>}
 */
async function searchNaverBlog(query, display = 100) {
  try {
    const response = await axios.get(NAVER_API_URL, {
      params: {
        query,
        display,
        start: 1,
        sort: 'date', // 최신순
      },
      headers: {
        'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
      },
    });

    const items = response.data.items || [];
    logger.debug(`[Naver] "${query}" 검색 결과: ${items.length}개`);

    return items.map(item => ({
      platform: 'naver_blog',
      title: stripHtml(item.title),
      url: item.link,
      blogName: item.bloggername,
      description: stripHtml(item.description),
      publishedAt: parseNaverDate(item.postdate),
    }));
  } catch (err) {
    logger.error(`[Naver] 검색 실패: "${query}"`, { error: err.message });
    return [];
  }
}

/**
 * 블로그 본문 내용 크롤링
 * 네이버 블로그는 모바일 URL로 접근하면 비교적 단순한 HTML 반환
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchBlogContent(url) {
  try {
    // 모바일 버전으로 변환하여 파싱 용이하게
    const mobileUrl = url.replace('blog.naver.com', 'm.blog.naver.com');

    const response = await axios.get(mobileUrl, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
      },
    });

    const $ = cheerio.load(response.data);

    // 본문 셀렉터 (네이버 블로그 구조)
    const content =
      $('.se-main-container').text() ||
      $('.post-view').text() ||
      $('div[class*="content"]').first().text() ||
      $('body').text();

    return content.replace(/\s+/g, ' ').trim().slice(0, 5000); // 최대 5000자
  } catch (err) {
    logger.debug(`[Naver] 본문 크롤링 실패: ${url}`, { error: err.message });
    return '';
  }
}

/**
 * 오늘자 레시피 블로그 포스팅 전체 수집
 * @returns {Promise<Array>}
 */
async function collectTodayRecipes() {
  logger.info('[Naver] 블로그 수집 시작...');
  const allResults = [];

  for (const keyword of TREND_KEYWORDS) {
    const results = await searchNaverBlog(keyword);
    allResults.push(...results);
    // API 호출 간격 (rate limit 방지)
    await sleep(300);
  }

  // 중복 URL 제거
  const unique = deduplicateByUrl(allResults);

  // 레시피 관련 키워드가 포함된 포스팅만 필터
  const RECIPE_KEYWORDS = ['레시피', '만들기', '만드는법', '재료', '만드는 방법', '조리법', '집밥', '홈베이킹', '요리법'];
  const filtered = unique.filter(item => {
    const text = (item.title + ' ' + (item.description || '')).toLowerCase();
    return RECIPE_KEYWORDS.some(kw => text.includes(kw));
  });

  logger.info(`[Naver] 수집 완료: ${filtered.length}개 (레시피 필터 후, 전체 ${unique.length}개)`);

  // 주요 포스팅 본문 크롤링 (상위 50개만, 부하 방지)
  const topPosts = filtered.slice(0, 50);
  for (const post of topPosts) {
    if (!post.content) {
      post.content = await fetchBlogContent(post.url);
      await sleep(200);
    }
  }

  return filtered;
}

// ─── 헬퍼 ────────────────────────────────────────────────────

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
}

// 네이버 날짜 "20260415" → "2026-04-15T00:00:00.000Z"
function parseNaverDate(postdate) {
  if (!postdate || postdate.length !== 8) return null;
  const y = postdate.slice(0, 4);
  const m = postdate.slice(4, 6);
  const d = postdate.slice(6, 8);
  return new Date(`${y}-${m}-${d}`).toISOString();
}

function deduplicateByUrl(items) {
  const seen = new Set();
  return items.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { collectTodayRecipes, searchNaverBlog };
