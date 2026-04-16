/**
 * Claude API를 이용한 레시피 처리 모듈
 * - 여러 소스에서 수집된 내용을 통합하여 표준 포맷으로 변환
 * - 대체 재료 추천
 * - SNS 게시글 생성
 *
 * Anthropic SDK with prompt caching for efficiency
 */
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../db/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

// ─── 시스템 프롬프트 (캐싱용) ──────────────────────────────────

const SYSTEM_PROMPT = `당신은 요리 전문가 겸 레시피 에디터입니다.
여러 블로그와 동영상에서 수집된 레시피 정보를 분석하고, 정확하고 실용적인 레시피로 통합합니다.

응답 규칙:
- 반드시 지정된 JSON 형식으로만 응답합니다
- 모든 설명은 한국어로 작성합니다
- 재료 분량은 구체적인 숫자로 표기합니다 (예: "약간" 대신 "1/4 작은술")
- 타임라인 단계는 초보자도 이해할 수 있도록 명확하게 작성합니다
- 요리 시간이 필요한 단계는 반드시 duration_minutes를 명시합니다`;

/**
 * 여러 소스를 분석해서 트렌드 레시피 이름 목록 추출
 * @param {Array} sources - 수집된 원본 데이터 배열
 * @returns {Promise<Array<{name: string, count: number, sources: Array}>>}
 */
async function extractTrendingRecipeNames(sources) {
  logger.info('[AI] 트렌드 레시피 이름 추출 시작...');

  // 너무 많은 제목은 AI 응답 품질 저하 → 최대 300개로 제한
  const titlesText = sources
    .slice(0, 300)
    .map(s => `[${s.platform}] ${s.title}`)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // 프롬프트 캐싱
      },
    ],
    messages: [
      {
        role: 'user',
        content: `다음은 오늘 수집된 레시피 관련 게시물 제목 목록입니다.
각 제목에서 요리 이름을 추출하고, 동일한 요리가 몇 번 언급되었는지 집계해주세요.

제목 목록:
${titlesText}

응답 형식 (JSON 배열):
[
  {
    "name": "요리 이름",
    "count": 언급 횟수,
    "variations": ["제목에서 발견된 변형 이름들"]
  }
]

2회 이상 언급된 요리만 포함하고, count 내림차순으로 정렬해주세요. 최대 30개까지만 반환하세요.`,
      },
    ],
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = extractJson(text, 'array');
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch);
  } catch (err) {
    logger.error('[AI] 레시피 이름 추출 파싱 실패', { error: err.message });
    return [];
  }
}

/**
 * 여러 소스의 내용을 하나의 표준 레시피로 통합
 * @param {string} recipeName - 레시피 이름
 * @param {Array} sources - 관련 원본 소스들
 * @returns {Promise<Object>} 표준화된 레시피 객체
 */
async function aggregateRecipe(recipeName, sources) {
  logger.info(`[AI] "${recipeName}" 레시피 통합 중...`);

  // 소스 내용 준비 (너무 길면 앞부분만 사용)
  const sourcesText = sources
    .slice(0, 15)
    .map((s, i) => `[소스 ${i + 1} - ${s.platform}]\n제목: ${s.title}\n내용: ${s.content || s.description || ''}`)
    .join('\n\n---\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `다음은 "${recipeName}"에 대한 여러 블로그/영상에서 수집된 정보입니다.
**중요**: 카페 방문기, 뉴스 기사, 맛집 소개 등 실제 레시피가 없는 소스는 무시하세요.
재료 목록과 조리 단계가 명확하게 있는 소스만 사용하여 가장 보편적이고 검증된 레시피로 통합해주세요.

수집된 소스들:
${sourcesText}

다음 JSON 형식으로 응답해주세요:
{
  "name": "레시피 공식 이름",
  "reason": "이 레시피가 최근 유행하는 이유 (2-3문장)",
  "tags": ["태그1", "태그2"],  // 반드시 아래 표준 카테고리 중 해당하는 것 1개 이상 포함: 한식, 양식, 중식, 일식, 디저트, 음료, 간식, 홈카페, 다이어트
  "total_time_minutes": 총 소요 시간,
  "servings": "인분 수 (예: 2인분)",
  "difficulty": "쉬움|보통|어려움",
  "ingredients": [
    {
      "name": "재료명",
      "amount": "분량",
      "unit": "단위",
      "is_optional": false,
      "substitutes": ["대체 재료1", "대체 재료2"]
    }
  ],
  "timeline_steps": [
    {
      "step_number": 1,
      "title": "단계 제목",
      "description": "상세 설명",
      "duration_minutes": 소요분,
      "timer_required": true/false,
      "is_photo_moment": true/false,
      "tip": "팁 또는 주의사항 (없으면 null)"
    }
  ],
  "major_variations": "소스별 주요 차이점 (있을 경우, 없으면 null)"
}`,
      },
    ],
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = extractJson(text, 'object');
    if (!jsonMatch) throw new Error('JSON 없음');

    const recipe = JSON.parse(jsonMatch);

    // 사용량 로깅
    logger.debug('[AI] 토큰 사용', {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cache_read: response.usage.cache_read_input_tokens || 0,
    });

    return recipe;
  } catch (err) {
    logger.error(`[AI] "${recipeName}" 레시피 통합 실패`, { error: err.message });
    return null;
  }
}

/**
 * 없는 재료에 대한 대체 재료 추천
 * @param {Array} missingIngredients - 없는 재료 목록
 * @param {string} recipeName - 레시피 이름
 * @returns {Promise<Object>} 재료별 대체재 맵
 */
async function recommendSubstitutes(missingIngredients, recipeName) {
  if (!missingIngredients.length) return {};

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `"${recipeName}" 레시피에서 다음 재료들이 없습니다.
각 재료의 대체 가능한 재료와 사용 비율을 알려주세요.

없는 재료: ${missingIngredients.join(', ')}

JSON 형식으로 응답:
{
  "재료명": {
    "substitutes": [
      {
        "name": "대체 재료명",
        "ratio": "사용 비율 (예: 동량, 1.5배)",
        "note": "맛/질감 차이 안내"
      }
    ]
  }
}`,
      },
    ],
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = extractJson(text, 'object');
    return jsonMatch ? JSON.parse(jsonMatch) : {};
  } catch {
    return {};
  }
}

/**
 * 요리 기록을 SNS 게시글 형태로 변환
 * @param {Object} recipe - 레시피 정보
 * @param {Object} session - 요리 세션 정보
 * @param {Array} photos - 단계별 사진 정보
 * @returns {Promise<Object>} SNS 게시글 초안
 */
async function generateSnsPost(recipe, session, photos) {
  logger.info(`[AI] "${recipe.name}" SNS 게시글 생성 중...`);

  const photoDescriptions = photos
    .map(p => `단계 ${p.step_number}: ${p.caption || ''}`)
    .join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `다음 요리 기록을 바탕으로 블로그/SNS 게시글을 작성해주세요.

레시피: ${recipe.name}
요리 시작: ${session.started_at}
완성 시각: ${session.completed_at || '진행 중'}
개인 메모: ${session.notes || '없음'}
촬영된 사진 단계:
${photoDescriptions || '없음'}

다음 형식으로 응답:
{
  "blog_title": "블로그 제목",
  "blog_content": "블로그 본문 (마크다운 형식, 2000자 내외)",
  "instagram_caption": "인스타그램 캡션 (이모지 포함, 300자 내외)",
  "hashtags": ["해시태그1", "해시태그2", ...],
  "summary": "한 줄 요약"
}`,
      },
    ],
  });

  try {
    const text = response.content[0].text;
    const jsonMatch = extractJson(text, 'object');
    return jsonMatch ? JSON.parse(jsonMatch) : null;
  } catch (err) {
    logger.error('[AI] SNS 게시글 생성 실패', { error: err.message });
    return null;
  }
}

// ─── JSON 추출 헬퍼 ───────────────────────────────────────────
// Claude가 ```json ... ``` 코드블록으로 감쌀 때도 처리
function extractJson(text, type) {
  // 1) 코드블록 안에서 추출
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const target = codeBlock ? codeBlock[1] : text;

  // 2) 배열 또는 객체 추출
  const pattern = type === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
  const match = target.match(pattern);
  return match ? match[0] : null;
}

module.exports = {
  extractTrendingRecipeNames,
  aggregateRecipe,
  recommendSubstitutes,
  generateSnsPost,
};
