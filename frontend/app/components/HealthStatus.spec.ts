import { flushPromises, mount } from '@vue/test-utils'
import HealthStatus from './HealthStatus.vue'
import { fetchHealth } from '~/utils/health'

vi.mock('~/utils/health', () => ({ fetchHealth: vi.fn() }))

describe('HealthStatus', () => {
  beforeEach(() => {
    vi.mocked(fetchHealth).mockReset()
  })

  it('shows success when the API is reachable', async () => {
    vi.mocked(fetchHealth).mockResolvedValue({ status: 'ok', db: 'up' })
    const wrapper = mount(HealthStatus)
    await flushPromises()
    expect(wrapper.get('[data-testid="health-status"]').text()).toContain('接続OK')
  })

  it('shows an error when the API fails', async () => {
    vi.mocked(fetchHealth).mockRejectedValue(new Error('down'))
    const wrapper = mount(HealthStatus)
    await flushPromises()
    expect(wrapper.get('[data-testid="health-status"]').text()).toContain('接続できません')
  })
})
