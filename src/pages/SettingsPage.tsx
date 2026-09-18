import { Download, Moon, Smartphone, Sun } from 'lucide-react'
import { Chip, PageHeader, Panel, Section, Segmented } from '@/components/common'
import { NativeSelect } from '@/components/FormParts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { updateSettings } from '@/db/repo'
import { usePaymentMethods, useSettings } from '@/hooks/useData'
import { useInstallPrompt } from '@/lib/install'
import type { ThemePref } from '@/lib/types'
import { useUi } from '@/stores/ui'

export function SettingsPage() {
  const settings = useSettings()
  const methods = usePaymentMethods().filter((m) => !m.archived)
  const setMonthKey = useUi((s) => s.setMonthKey)
  const { canInstall, install } = useInstallPrompt()

  return (
    <>
      <PageHeader title="Settings" backTo="/more" />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <Section title="Appearance">
          <Panel className="space-y-3">
            <p className="text-sm font-medium">Theme</p>
            <Segmented<ThemePref>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => void updateSettings({ theme })}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'system', label: 'Phone' },
              ]}
            />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              {settings.theme === 'dark' ? <Moon className="size-3.5" aria-hidden /> : settings.theme === 'light' ? <Sun className="size-3.5" aria-hidden /> : <Smartphone className="size-3.5" aria-hidden />}
              {settings.theme === 'system' ? "Follows your phone's dark mode setting" : `Always ${settings.theme}`}
            </p>
          </Panel>
        </Section>

        <Section title="Budget month">
          <Panel className="space-y-2">
            <Label htmlFor="start-day">Month starts on</Label>
            <NativeSelect
              id="start-day"
              value={settings.monthStartDay}
              onChange={(e) => {
                setMonthKey(null)
                void updateSettings({ monthStartDay: Number(e.target.value) })
              }}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? '1st (calendar month)' : `Day ${d}`}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">Pick your salary or rent date if your month runs from there.</p>
          </Panel>
        </Section>

        <Section title="New expenses">
          <Panel className="space-y-2">
            <p className="text-sm font-medium">Default payment method</p>
            <div className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <Chip key={m.id} selected={settings.defaultPaymentMethodId === m.id} onClick={() => void updateSettings({ defaultPaymentMethodId: m.id })}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </Panel>
        </Section>

        {canInstall ? (
          <Button className="h-12 w-full" onClick={() => void install()}>
            <Download aria-hidden /> Install Evenly on this phone
          </Button>
        ) : null}
      </div>
    </>
  )
}
