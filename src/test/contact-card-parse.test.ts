// 전자명함 텍스트 파서 계약 (Phase 3.18.1 §2) — `src/lib/contactCard.ts`.
//
// 파서의 약속은 "많이 맞히는 것"이 아니라 **"틀린 값을 만들지 않는 것"**이다. 확인 표가 편집 가능하므로
// 빈 칸은 사람이 1초에 채우지만, 그럴듯하게 잘못 채운 값은 그대로 담당자 명단에 들어간다.
// 그래서 여기서는 정상 인식만이 아니라 **부분 실패가 빈 문자열로 남는지**를 같은 무게로 검사한다.
import { describe, expect, it } from 'vitest'
import { parseContactCard, parseContactCards } from '../lib/contactCard'

describe('parseContactCard — 전자명함 한 장', () => {
  it('전형적인 명함 5줄을 전 필드로 나눈다', () => {
    const parsed = parseContactCard(
      [
        '홍길동',
        '가상이벤트(주)',
        '기획팀 팀장',
        'hong@example.com',
        'M. 010-1234-5678',
      ].join('\n'),
    )
    expect(parsed).toEqual({
      name: '홍길동',
      title: '기획팀 팀장',
      company: '가상이벤트(주)',
      email: 'hong@example.com',
      phone: '010-1234-5678',
    })
  })

  it('이름·직함이 한 줄에 붙어 있어도 분리한다 — 슬래시 서식 포함', () => {
    const slash = parseContactCard('김기획 / 운영본부 실장 / 가상컨벤션 주식회사 / kim@example.com')
    expect(slash.name).toBe('김기획')
    expect(slash.title).toBe('운영본부 실장')
    expect(slash.company).toBe('가상컨벤션 주식회사')

    const spaced = parseContactCard('박운영 매니저\npark@example.com')
    expect(spaced.name).toBe('박운영')
    expect(spaced.title).toBe('매니저')
  })

  it('전화가 없으면 전화만 빈 문자열 — 다른 값으로 메우지 않는다', () => {
    const parsed = parseContactCard('이등록\n가상이벤트(주)\nlee@example.com')
    expect(parsed.phone).toBe('')
    expect(parsed.name).toBe('이등록')
    expect(parsed.email).toBe('lee@example.com')
  })

  it('직함이 없으면 직함만 빈 문자열 — 회사명을 직함으로 밀어 넣지 않는다', () => {
    const parsed = parseContactCard('최디자인\n가상스튜디오(주)\nchoi@example.com\n010-2222-3333')
    expect(parsed.title).toBe('')
    expect(parsed.company).toBe('가상스튜디오(주)')
    expect(parsed.name).toBe('최디자인')
  })

  it('인식 근거가 없으면 그 필드를 비운다 — 주소·부서 줄을 이름으로 쓰지 않는다', () => {
    const parsed = parseContactCard('서울시 가상구 가상로 12, 3층\n기획팀\ninfo@example.com')
    expect(parsed.name).toBe('')
    expect(parsed.title).toBe('')
  })

  it('빈 입력은 전 필드가 빈 문자열이다', () => {
    expect(parseContactCard('')).toEqual({ name: '', title: '', company: '', email: '', phone: '' })
    expect(parseContactCard('   \n\n  ')).toEqual({
      name: '',
      title: '',
      company: '',
      email: '',
      phone: '',
    })
  })

  it('같은 입력은 언제나 같은 결과다 — 순수 함수', () => {
    const text = '홍길동 팀장\n가상이벤트(주)\nhong@example.com\n010-1234-5678'
    expect(parseContactCard(text)).toEqual(parseContactCard(text))
  })
})

describe('parseContactCard — 전화 표기 정규화', () => {
  it.each([
    ['010-1234-5678', '010-1234-5678'],
    ['010 1234 5678', '010-1234-5678'],
    ['01012345678', '010-1234-5678'],
    ['+82-10-1234-5678', '010-1234-5678'],
    ['+82 10 1234 5678', '010-1234-5678'],
    ['02-123-4567', '02-123-4567'],
    ['0212345678', '02-1234-5678'],
    ['031.123.4567', '031-123-4567'],
  ])('%s → %s', (raw, expected) => {
    expect(parseContactCard(`홍길동\n${raw}`).phone).toBe(expected)
  })

  it('여러 번호가 있으면 휴대폰을 고른다', () => {
    const parsed = parseContactCard('홍길동 팀장\nT. 02-123-4567\nF. 02-123-4568\nM. 010-9876-5432')
    expect(parsed.phone).toBe('010-9876-5432')
  })

  it('날짜·우편번호를 전화로 읽지 않는다', () => {
    expect(parseContactCard('홍길동\n2026-08-29 기준\n우편번호 06234').phone).toBe('')
  })
})

describe('parseContactCards — 여러 장', () => {
  it('빈 줄 2개 이상이 카드 경계다', () => {
    const parsed = parseContactCards(
      [
        '홍길동 팀장',
        '가상이벤트(주)',
        'hong@example.com',
        '010-1111-2222',
        '',
        '',
        '김운영 과장',
        '가상컨벤션(주)',
        'kim@example.com',
        '010-3333-4444',
      ].join('\n'),
    )
    expect(parsed).toHaveLength(2)
    expect(parsed.map((c) => c.name)).toEqual(['홍길동', '김운영'])
    expect(parsed.map((c) => c.email)).toEqual(['hong@example.com', 'kim@example.com'])
    expect(parsed[1].title).toBe('과장')
  })

  it('빈 줄 1개는 같은 명함 안의 문단 구분이다', () => {
    const parsed = parseContactCards('홍길동 팀장\n가상이벤트(주)\n\nhong@example.com\n010-1111-2222')
    expect(parsed).toHaveLength(1)
    expect(parsed[0].email).toBe('hong@example.com')
  })

  it('빈 입력·인식할 것이 없는 입력은 빈 배열이다', () => {
    expect(parseContactCards('')).toEqual([])
    expect(parseContactCards('\n\n\n')).toEqual([])
  })
})
