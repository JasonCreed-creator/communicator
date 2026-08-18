import { useParams } from 'react-router-dom'
import PagePlaceholder from '../components/PagePlaceholder'
import NotFoundPage from './NotFoundPage'

const AREA_LABELS: Record<string, string> = {
  design: '디자인',
  ops: '운영',
}

export default function AreaBoardPage() {
  const { area } = useParams()
  const areaLabel = area ? AREA_LABELS[area] : undefined

  if (!areaLabel) return <NotFoundPage />

  return (
    <PagePlaceholder
      screenId="S2"
      title={`${areaLabel} 보드`}
      description="카테고리 그룹 카드: 상태 뱃지 · 최신 버전 · 담당 · 마감 / 항목 생성 · 필터 · 상태 전이"
      implementedIn="Phase 2"
    />
  )
}
