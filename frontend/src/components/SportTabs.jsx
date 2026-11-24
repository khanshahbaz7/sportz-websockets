import { Icon } from './Icons'

export function SportTabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="group" aria-label="Filter matches by sport">
      {tabs.map((tab) => {
        const selected = active === tab.key

        return (
          <button
            aria-pressed={selected}
            className={`tab${selected ? ' is-active' : ''}`}
            key={tab.key}
            onClick={() => onChange(tab.key)}
            type="button"
          >
            <Icon name={tab.icon} size={14} />
            <span className="tab__label">{tab.label}</span>
            <span className="tab__count">{tab.count}</span>
          </button>
        )
      })}
    </div>
  )
}
