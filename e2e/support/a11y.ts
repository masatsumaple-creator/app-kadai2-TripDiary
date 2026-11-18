import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

// WCAG 2.0 / 2.1 の A・AA に該当するルールだけを検査する(ベストプラクティスの助言は対象外)
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

export interface A11yViolation {
  id: string
  impact: string | null | undefined
  help: string
  targets: string[]
}

export async function scanA11y(page: Page): Promise<A11yViolation[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    // 違反した要素(最大 3 件)。失敗したときに、どこを直すかが分かるようにする
    targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }))
}
