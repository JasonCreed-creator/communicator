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
      {cues.loading && <p className="text-sm text-gray-400">불러오는 중…</p>}
      <ErrorAlert message={cues.error} />
      <ErrorAlert message={moveError} />

      {!cues.loading && list.length === 0 && <p className="text-sm text-gray-400">작성된 큐가 없습니다.</p>}

      {list.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-1.5 pr-3 font-medium">큐번호</th>
                <th className="py-1.5 pr-3 font-medium">시간</th>
                <th className="py-1.5 pr-3 font-medium">구분</th>
                <th className="py-1.5 pr-3 font-medium">내용</th>
                <th className="py-1.5 pr-3 font-medium">음향</th>
                <th className="py-1.5 pr-3 font-medium">조명</th>
                <th className="py-1.5 pr-3 font-medium">스크린</th>
                <th className="py-1.5 font-medium">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
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
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="mb-2 text-xs font-semibold text-gray-500">행 추가</p>
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
