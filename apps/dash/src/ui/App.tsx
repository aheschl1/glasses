import { DASH_API_BASE } from '@andrewheschl/dash-api'
import { MAX_REFRESH_MS, MIN_REFRESH_MS, updateSettings } from '../settings'
import { SectionOrder } from './SectionOrder'
import { SignIn } from './SignIn'
import { useSettings } from './useSettings'

/**
 * Settings screen shown in the phone webview. The glasses render themselves —
 * this page only edits what they show and how often.
 */
export function App() {
  const settings = useSettings()

  return (
    <main>
      <header>
        <h1>Dash</h1>
        <p className="hint">{DASH_API_BASE.replace('https://', '')}</p>
      </header>

      <section>
        <h2>Refresh</h2>
        <p className="hint">
          How long to wait between updates of the section on screen. Each update is a
          Bluetooth write, so a short interval costs battery on both the glasses and
          the phone.
        </p>
        <div className="refresh">
          <input
            type="range"
            min={MIN_REFRESH_MS}
            max={MAX_REFRESH_MS}
            step={500}
            value={settings.refreshMs}
            onChange={(event) => updateSettings({ refreshMs: Number(event.target.value) })}
          />
          <output>{(settings.refreshMs / 1000).toFixed(1)}s</output>
        </div>
      </section>

      <section>
        <h2>Menu order</h2>

        <SectionOrder order={settings.sectionOrder} hidden={settings.hiddenSections} />
      </section>

      <section>
        <h2>Account</h2>
        <p className="hint">
          Needed only for commands such as restarting the host. Readings work signed out.
        </p>
        <SignIn settings={settings} />
      </section>
    </main>
  )
}
