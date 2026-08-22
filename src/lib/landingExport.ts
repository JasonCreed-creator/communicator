// 랜딩 → 자가완결 단일 HTML 내보내기 (v2.1).
//
// 발행 방식이 "단일 HTML 내보내기"라, 이 파일 하나를 기존 호스팅에 올리면 그대로 동작해야 한다.
// 따라서 CSS는 전량 인라인이고 외부 요청은 만들지 않는다 — 단 하나의 예외가 측정 스크립트다
// (GA4/GTM은 정의상 외부 호출이며, 사용자가 측정 ID를 넣었을 때만 주입된다).
//
// 이스케이프: 모든 사용자 입력은 escapeHtml을 거친다. 측정 ID는 형식 검증(GA_ID_RE/GTM_ID_RE)을
// 통과한 값만 스크립트에 들어간다 — 임의 문자열이 <script> 안으로 새는 경로를 만들지 않기 위함.
import type { LandingPage, LandingSection } from '../types/entities'
import { LANDING_SECTION_LABELS } from './landingTemplate'

/** GA4 측정 ID — G- 뒤 영숫자 */
export const GA_ID_RE = /^G-[A-Z0-9]{4,20}$/
/** GTM 컨테이너 ID */
export const GTM_ID_RE = /^GTM-[A-Z0-9]{4,10}$/

export function isValidGaId(v: string | null | undefined): boolean {
  return !!v && GA_ID_RE.test(v.trim())
}
export function isValidGtmId(v: string | null | undefined): boolean {
  return !!v && GTM_ID_RE.test(v.trim())
}

export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 줄바꿈 보존 — 카피 본문용 */
function nl2br(v: string): string {
  return escapeHtml(v).replace(/\n/g, '<br>')
}

/**
 * 측정 스크립트. 유효한 ID가 없으면 빈 문자열 — 즉 GA를 넣지 않으면 외부 요청 0건을 유지한다.
 * 전환 이벤트는 폼 제출 시 아래 인라인 스크립트가 발화시킨다.
 */
export function analyticsSnippet(page: LandingPage): string {
  const ga = page.analytics.ga_measurement_id?.trim() ?? ''
  const gtm = page.analytics.gtm_container_id?.trim() ?? ''
  const out: string[] = []

  if (isValidGaId(ga)) {
    out.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>`,
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
        `gtag('js',new Date());gtag('config','${ga}');</script>`,
    )
  }
  if (isValidGtmId(gtm)) {
    out.push(
      `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
        `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
        `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
        `})(window,document,'script','dataLayer','${gtm}');</script>`,
    )
  }
  return out.join('\n')
}

/** 전환 계측 — 폼 열람(form_start)과 제출(전환 이벤트)을 dataLayer/gtag 양쪽에 보낸다 */
function trackingScript(page: LandingPage): string {
  const ev = escapeHtml(page.analytics.conversion_event || 'generate_lead')
  return `<script>
(function(){
  function track(name, params){
    if (typeof window.gtag === 'function') window.gtag('event', name, params || {});
    if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({event:name}, params||{}));
  }
  var form = document.getElementById('lp-form');
  if (!form) return;
  var started = false;
  form.addEventListener('focusin', function(){
    if (started) return;
    started = true;
    track('form_start', { form_id: 'lp-form' });
  });
  form.addEventListener('submit', function(){
    track('${ev}', { form_id: 'lp-form' });
  });
})();
</script>`
}

const CSS = `
:root{--ink:#1a1a1a;--sub:#5a5a5a;--cap:#8a8a8a;--line:#e6e2da;--bg:#faf8f4;--card:#fff;--accent:#ff6b00;--accent-ink:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;line-height:1.7;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
.wrap{max-width:900px;margin:0 auto;padding:0 20px}
.nav{position:sticky;top:0;z-index:50;background:rgba(26,26,26,.94);backdrop-filter:blur(6px)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-top:12px;padding-bottom:12px}
.nav a{color:#f2ede4;text-decoration:none;font-size:14px;margin-right:16px}
.nav .cta{background:var(--accent);color:var(--accent-ink);padding:8px 16px;border-radius:8px;font-weight:700;margin-right:0}
.nav .cta[aria-disabled="true"]{background:#4a4a4a;color:#bdbdbd;cursor:not-allowed}
section{padding:56px 0;border-bottom:1px solid var(--line)}
section:last-of-type{border-bottom:0}
.hero{background:var(--ink);color:#f7f3ec;padding:72px 0}
.hero h1{font-size:34px;line-height:1.3;margin:0 0 12px}
.hero .meta{color:#c9c2b6;font-size:16px}
h2{font-size:24px;margin:0 0 8px}
.lede{color:var(--sub);margin:0 0 24px;white-space:pre-line}
.grid{display:grid;gap:14px}
.g2{grid-template-columns:repeat(2,1fr)}
.g4{grid-template-columns:repeat(4,1fr)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}
.card .t{font-weight:700}
.card .d{color:var(--sub);font-size:14px;margin-top:4px;white-space:pre-line}
.card .m{color:var(--cap);font-size:12px;margin-top:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);font-size:14px;vertical-align:top}
th{background:#f3efe7;font-size:12px;letter-spacing:.04em;color:var(--sub)}
tr:last-child td{border-bottom:0}
.time{white-space:nowrap;color:var(--accent);font-weight:700}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:8px}
summary{cursor:pointer;font-weight:600}
details p{color:var(--sub);margin:8px 0 0;white-space:pre-line}
form{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 6px}
input,textarea,select{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:8px;font-size:15px;font-family:inherit;background:#fff;color:var(--ink)}
textarea{min-height:88px}
.req{color:var(--accent)}
.consent{margin-top:18px;border-top:1px solid var(--line);padding-top:14px}
.consent label{display:flex;gap:8px;align-items:flex-start;font-weight:600}
.consent input{width:auto;margin-top:4px}
.consent .body{color:var(--sub);font-size:12px;white-space:pre-line;margin:6px 0 0 24px}
button[type=submit]{margin-top:20px;width:100%;padding:15px;background:var(--accent);color:var(--accent-ink);border:0;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit}
button[type=submit][disabled]{background:#c9c2b6;cursor:not-allowed}
footer{background:var(--ink);color:#b9b2a6;font-size:13px;padding:40px 0}
footer .t{color:#f2ede4;font-weight:600}
.closed{display:inline-block;background:#4a4a4a;color:#e8e3d9;padding:6px 14px;border-radius:999px;font-size:13px;font-weight:700}
@media(max-width:720px){.g4{grid-template-columns:repeat(2,1fr)}.g2{grid-template-columns:1fr}.hero h1{font-size:26px}.nav a{margin-right:10px;font-size:13px}}
@media print{.nav{position:static}section{break-inside:avoid}}
`

function renderItemsAsCards(s: LandingSection, cls: string): string {
  if (!s.items.length) return ''
  const cards = s.items
    .map(
      (it) =>
        `<div class="card">${it.meta ? `<div class="m">${escapeHtml(it.meta)}</div>` : ''}` +
        `<div class="t">${escapeHtml(it.label)}</div>` +
        `${it.detail ? `<div class="d">${nl2br(it.detail)}</div>` : ''}</div>`,
    )
    .join('')
  return `<div class="grid ${cls}">${cards}</div>`
}

function renderSection(s: LandingSection, page: LandingPage): string {
  if (!s.visible) return ''
  const head = s.headline ? `<h2>${escapeHtml(s.headline)}</h2>` : ''
  const lede = s.body ? `<p class="lede">${nl2br(s.body)}</p>` : ''
  const anchor = ` id="sec-${escapeHtml(s.type)}"`

  switch (s.type) {
    case 'hero':
      return `<header class="hero"${anchor}><div class="wrap">
<h1>${escapeHtml(s.headline ?? page.title)}</h1>
${s.body ? `<div class="meta">${nl2br(s.body)}</div>` : ''}
${page.status === 'closed' ? '<p><span class="closed">신청 마감</span></p>' : ''}
</div></header>`

    case 'lead':
    case 'pitch':
      return `<section${anchor}><div class="wrap">${head}${lede}</div></section>`

    case 'agenda': {
      const rows = s.items
        .map(
          (it) =>
            `<tr><td class="time">${escapeHtml(it.meta ?? '')}</td>` +
            `<td><strong>${escapeHtml(it.label)}</strong>${it.detail ? `<div class="d">${nl2br(it.detail)}</div>` : ''}</td></tr>`,
        )
        .join('')
      return `<section${anchor}><div class="wrap">${head}${lede}
${rows ? `<table><thead><tr><th>TIME</th><th>SESSION</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
</div></section>`
    }

    case 'tickets': {
      const rows = s.items
        .map(
          (it) =>
            `<tr><td><strong>${escapeHtml(it.label)}</strong>${it.detail ? `<div class="d">${nl2br(it.detail)}</div>` : ''}</td>` +
            `<td class="time">${escapeHtml(it.meta ?? '')}</td></tr>`,
        )
        .join('')
      return `<section${anchor}><div class="wrap">${head}${lede}
${rows ? `<table><thead><tr><th>티켓 종류</th><th>가격</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
</div></section>`
    }

    case 'faq': {
      const rows = s.items
        .map(
          (it) =>
            `<details><summary>${escapeHtml(it.label)}${it.meta ? ` <span class="m">· ${escapeHtml(it.meta)}</span>` : ''}</summary>` +
            `${it.detail ? `<p>${nl2br(it.detail)}</p>` : ''}</details>`,
        )
        .join('')
      return `<section${anchor}><div class="wrap">${head}${lede}${rows}</div></section>`
    }

    case 'form':
      return `<section${anchor}><div class="wrap">${head}${lede}${renderForm(page)}</div></section>`

    case 'footer': {
      const rows = s.items
        .map(
          (it) =>
            `<p><span class="t">${escapeHtml(it.label)}</span><br>${it.detail ? nl2br(it.detail) : ''}</p>`,
        )
        .join('')
      return `<footer${anchor}><div class="wrap">${head}${rows}</div></footer>`
    }

    case 'benefits':
      return `<section${anchor}><div class="wrap">${head}${lede}${renderItemsAsCards(s, 'g4')}</div></section>`

    case 'speakers':
    case 'zones':
    case 'sponsors':
    case 'venue':
      return `<section${anchor}><div class="wrap">${head}${lede}${renderItemsAsCards(s, 'g2')}</div></section>`

    default:
      return `<section${anchor}><div class="wrap">${head}${lede}</div></section>`
  }
}

function renderForm(page: LandingPage): string {
  const closed = page.status === 'closed'
  const fields = page.form_fields
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => {
      const req = f.required ? ' required' : ''
      const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : ''
      const name = `f_${escapeHtml(f.id)}`
      const label = `<label for="${name}">${escapeHtml(f.label)}${f.required ? ' <span class="req">*</span>' : ''}</label>`
      if (f.kind === 'textarea') return `${label}<textarea id="${name}" name="${name}"${ph}${req}></textarea>`
      if (f.kind === 'select' || f.kind === 'rank') {
        const opts = f.choices
          .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
          .join('')
        return `${label}<select id="${name}" name="${name}"${req}><option value="">선택</option>${opts}</select>`
      }
      const type = f.kind === 'email' ? 'email' : f.kind === 'tel' ? 'tel' : 'text'
      return `${label}<input id="${name}" name="${name}" type="${type}"${ph}${req}>`
    })
    .join('\n')

  const consents = page.consents
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (c) =>
        `<div class="consent"><label><input type="checkbox" name="c_${escapeHtml(c.id)}"${c.required ? ' required' : ''}>` +
        `<span>${escapeHtml(c.title)}</span></label>` +
        `<div class="body">${nl2br(c.body)}</div></div>`,
    )
    .join('')

  const action =
    page.submit_target === 'external' && page.external_submit_url
      ? ` action="${escapeHtml(page.external_submit_url)}" method="post"`
      : ''

  return `<form id="lp-form"${action}>
${fields}
${consents}
<button type="submit"${closed ? ' disabled' : ''}>${closed ? '신청 마감' : escapeHtml(page.cta_label)}</button>
</form>`
}

function renderNav(page: LandingPage, sections: LandingSection[]): string {
  if (!page.sticky_nav) return ''
  const links = sections
    .filter((s) => s.visible && ['speakers', 'agenda', 'tickets', 'faq'].includes(s.type))
    .map((s) => `<a href="#sec-${escapeHtml(s.type)}">${escapeHtml(LANDING_SECTION_LABELS[s.type])}</a>`)
    .join('')
  const cta =
    page.status === 'closed'
      ? '<a class="cta" aria-disabled="true">신청 마감</a>'
      : `<a class="cta" href="#sec-form">${escapeHtml(page.cta_label)}</a>`
  return `<nav class="nav"><div class="wrap"><div>${links}</div>${cta}</div></nav>`
}

/**
 * 완성된 단일 HTML. `sections`에는 autofill을 통과시킨 결과를 넘긴다.
 * 반환값은 <!doctype>부터 </html>까지 자가완결 문서다.
 */
export function buildLandingHtml(page: LandingPage, sections: LandingSection[]): string {
  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order)
  const hero = ordered.find((s) => s.type === 'hero' && s.visible)
  const rest = ordered.filter((s) => s !== hero)
  const desc = hero?.body ? escapeHtml(hero.body.replace(/\n/g, ' ')).slice(0, 150) : ''

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
${desc ? `<meta name="description" content="${desc}">` : ''}
<meta property="og:title" content="${escapeHtml(page.title)}">
${desc ? `<meta property="og:description" content="${desc}">` : ''}
${analyticsSnippet(page)}
<style>${CSS}</style>
</head>
<body>
${renderNav(page, ordered)}
${hero ? renderSection(hero, page) : ''}
${rest.map((s) => renderSection(s, page)).join('\n')}
${trackingScript(page)}
</body>
</html>`
}

/** 내보내기 파일명 — slug 기준, 안전 문자만 */
export function landingFileName(page: LandingPage): string {
  const safe = (page.slug || 'landing').replace(/[^a-zA-Z0-9-_]/g, '-')
  return `${safe}.html`
}
