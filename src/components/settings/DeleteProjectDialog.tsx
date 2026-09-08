// v2.8 §4-1c — 행사 하드 삭제의 권한 술어와 확인 모달.
//
// 권한 축이 이 파일의 존재 이유다. 행사 안의 다른 파괴적 조작은 전부 그 행사의 pm이 하지만,
// 삭제만 **전역 app_role='admin'**이다 — 되돌릴 수 없고 행사 자체가 사라지므로 "그 행사 안에서의
// 지위"로 판정하면 순환이기 때문이다(설계서 §6.1: pm 열이 `—`인 첫 행).
//
// canDeleteProject는 견적 축(canUseQuotes = admin·sales)과 **다른 술어**다. admin이 sales와
// 갈라지는 첫 지점이라, 기존 admin·sales 술어를 admin 단독으로 좁히지 않고 여기에 새로 둔다.
//
// 오삭제 방어는 상태가 아니라 확인 단계로 한다(§4-1c 결정 2 — 종료는 삭제의 선행 조건이 아니다).
// window.confirm 대신 행사명 타이핑을 요구하는 이유: 삭제는 카드 안 버튼들 사이에 있고,
// confirm은 Enter 한 번으로 지나간다. 지울 행사의 이름을 직접 쳐야 대상 오인까지 걸러진다.
import { useEffect, useRef, useState } from 'react'
import { useMutation } from '../../hooks/useAsync'
import { getDataProvider } from '../../providers'
import type { UUID } from '../../types/entities'
import type { CurrentUser } from '../../types/views'

const provider = getDataProvider()

/** 행사 삭제 권한 = 전역 admin 단독. 서버(RLS·delete_project RPC)가 같은 판정을 다시 한다. */
export function canDeleteProject(user: Pick<CurrentUser, 'app_role'>): boolean {
  return user.app_role === 'admin'
}

export default function DeleteProjectDialog({
  projectId,
  projectName,
  onCancel,
  onDeleted,
}: {
  projectId: UUID
  projectName: string
  /** 취소·닫기 */
  onCancel: () => void
  /** 삭제 성공 — 호출부가 목록을 다시 읽고 필요하면 화면을 옮긴다 */
  onDeleted: () => void
}) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const remove = useMutation(() => provider.deleteProject(projectId).then(() => true))

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  const matches = typed.trim() === projectName.trim()

  const handleDelete = async () => {
    if (!matches) return
    const ok = await remove.run()
    if (ok) onDeleted()
  }

  return (
    <div className="print-hidden fixed inset-0 z-30 flex items-center justify-center p-4">
      <div aria-hidden onClick={onCancel} className="absolute inset-0 bg-ink/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="행사 삭제"
        data-testid="delete-project-dialog"
        className="ui-card relative z-10 w-full max-w-md p-6"
      >
        <h2 className="t-card-title">행사를 삭제할까요?</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-sub">
          <b className="text-ink">{projectName}</b>과(와) 여기에 속한 자료가 전부 사라집니다 —
          담당자 배정·제작 항목과 버전·컨펌 기록·일정·등록 명단·랜딩·정산·파트너·발주처 링크.
          <b className="text-negative"> 되돌릴 수 없습니다.</b>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-sub">
          연결된 견적은 지워지지 않고 행사 연결만 풀립니다. 담당자 주소록과 협력사 목록도 그대로
          남습니다.
        </p>

        <label className="mt-4 block text-sm font-medium text-ink" htmlFor="delete-confirm-name">
          확인을 위해 행사명 <b>{projectName}</b>을(를) 입력하세요
        </label>
        <input
          id="delete-confirm-name"
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="ui-input mt-1.5 w-full"
          autoComplete="off"
          placeholder={projectName}
        />

        {remove.error && <p className="mt-3 text-sm text-negative">{remove.error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            취소
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!matches || remove.pending}
            className="btn btn-ghost-negative"
          >
            영구 삭제
          </button>
        </div>
      </div>
    </div>
  )
}
