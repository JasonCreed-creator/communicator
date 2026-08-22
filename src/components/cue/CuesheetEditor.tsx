import { useState, type FormEvent } from 'react'
import Card from '../internal/Card'
import ErrorAlert from '../internal/ErrorAlert'
import { useAsync, useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import CueFieldsForm from './CueFieldsForm'
import CueRow from './CueRow'
import { toFormValues, toInput, type CueFormValues } from './cueFormValues'

const provider = getDataProvider()

/**
 * S3 큐시트 정형 에디터 — category='큐시트' 항목은 파일 미리보기·버전 업로드 폼 대신 이 표를 렌더한다
 * (CLAUDE.md v1.4 §4 Phase 3.6c). 행 CRUD는 DataProvider의 listCues/createCue/updateCue/deleteCue만
 * 경유하며, 정렬은 ↑/↓ 버튼으로 인접 행의 sort_order를 맞바꾼다(드래그는 jsdom 테스트 불가 — 결정 로그 준거).
 */
export default function CuesheetEditor({
  deliverableId,
  canEdit,
}: {
  deliverableId: string
  /** pm·ops만 true — §6.1 큐시트 편집 권한. false면 대본 열람만 가능한 읽기 전용 표 */
  canEdit: boolean
}) {
  const cues = useAsync(() => provider.listCues(deliverableId), [deliverableId])
  const list = cues.data ?? []
  const [moveError, setMoveError] = useState<string | null>(null)

  const handleMove = async (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= list.length) return
    const a = list[index]
    const b = list[j]
    // MockProvider는 cue 객체를 참조 그대로 반환·변경(in-place)하므로, updateCue 호출 전에
    // 두 sort_order 값을 원시값으로 먼저 떠 둔다 — 그렇지 않으면 두 번째 호출이 이미
    // 변경된 a.sort_order를 읽어와 두 큐가 같은 sort_order를 갖게 되는 버그가 생긴다.
    const aOrder = a.sort_order
    const bOrder = b.sort_order
    setMoveError(null)
    try {
      // sort_order를 서로 맞바꾼다 — 두 번의 updateCue 호출로 표현(provider에 별도 swap API 없음)
      await provider.updateCue(a.id, { sort_order: bOrder })
      await provider.updateCue(b.id, { sort_order: aOrder })
      cues.reload()
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : '순서 변경에 실패했습니다.')
    }
  }

  return (
    <Card title="큐시트">
      {cues.loading && <p className="text-sm text-ink-cap">불러오는 중…</p>}
      <ErrorAlert message={cues.error} />
      <ErrorAlert message={moveError} />

      {!cues.loading && list.length === 0 && <p className="text-sm text-ink-cap">작성된 큐가 없습니다.</p>}

      {list.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[936px] border-collapse text-sm">
            {/* 3.10.1 R1 — 열 규격: 큐번호 56·시간 64·구분 72·내용 minmax(240,1fr)·콘솔 3열 124·액션 132.
                합계 936 = 1280 콘텐츠 폭(≈958)에 수평 스크롤 없이 수납 — 대본 링크는 내용 셀 하단 캡션으로 이동 */}
            <thead>
              <tr>
                <th className="ui-th min-w-[56px] whitespace-nowrap">큐번호</th>
                <th className="ui-th min-w-[64px] whitespace-nowrap">시간</th>
                <th className="ui-th min-w-[72px] whitespace-nowrap">구분</th>
                <th className="ui-th min-w-[240px]">내용</th>
                <th className="ui-th w-[124px]">음향</th>
                <th className="ui-th w-[124px]">조명</th>
                <th className="ui-th w-[124px]">스크린</th>
                <th className="ui-th w-[132px] whitespace-nowrap">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((c, i) => (
                <CueRow
                  key={c.id}
                  cue={c}
                  canEdit={canEdit}
                  isFirst={i === 0}
                  isLast={i === list.length - 1}
                  onMoveUp={() => handleMove(i, -1)}
                  onMoveDown={() => handleMove(i, 1)}
                  onChanged={cues.reload}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && <CueAddForm deliverableId={deliverableId} onAdded={cues.reload} />}
    </Card>
  )
}

function CueAddForm({ deliverableId, onAdded }: { deliverableId: string; onAdded: () => void }) {
  const [values, setValues] = useState<CueFormValues>(() => toFormValues(null))
  const create = useMutation((input: ReturnType<typeof toInput>) => provider.createCue(deliverableId, input))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await create.run(toInput(values))
    if (result) {
      setValues(toFormValues(null))
      onAdded()
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 t-caption font-semibold">행 추가</p>
      <CueFieldsForm
        values={values}
        onChange={(p) => setValues((v) => ({ ...v, ...p }))}
        onSubmit={handleSubmit}
        submitLabel="추가"
        pending={create.pending}
        error={create.error}
      />
    </div>
  )
}
