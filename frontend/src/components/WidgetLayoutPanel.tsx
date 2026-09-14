import { ArrowDown, ArrowUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { moveWidget } from '@/utils/widgetLayout';
import type { WidgetDefinition, WidgetLayout } from '@/utils/widgetLayout';

interface WidgetLayoutPanelProps {
  /** Joriy tartibdagi (ruxsat berilgan) vidjetlar */
  widgets: ReadonlyArray<WidgetDefinition & { visible: boolean }>;
  onChange: (layout: WidgetLayout) => void;
  onReset: () => void;
}

/** Vidjetlarni yashirish/ko‘rsatish va tartibini o‘zgartirish — sozlama xodim profilida saqlanadi */
export function WidgetLayoutPanel({ widgets, onChange, onReset }: WidgetLayoutPanelProps) {
  const order = widgets.map((widget) => widget.key);
  const hidden = widgets.filter((widget) => !widget.visible).map((widget) => widget.key);

  return (
    <Card className="mb-4 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-fg">Vidjetlar</p>
          <p className="text-xs text-fg-muted">Ko‘rinishi va tartibi profilingizda saqlanadi — boshqa qurilmada ham shunday ochiladi</p>
        </div>
        <Button size="sm" variant="ghost" leftIcon={<RotateCcw className="size-4" aria-hidden />} onClick={onReset}>
          Standart holat
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {widgets.map((widget, index) => (
          <li key={widget.key} className="flex items-center gap-3 px-3 py-2">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-fg">
              <Checkbox
                checked={widget.visible}
                onChange={() =>
                  onChange({ order, hidden: widget.visible ? [...hidden, widget.key] : hidden.filter((key) => key !== widget.key) })
                }
              />
              <span className="truncate">{widget.label}</span>
            </label>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${widget.label} — yuqoriga`}
              disabled={index === 0}
              onClick={() => onChange({ order: moveWidget(order, widget.key, -1), hidden })}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`${widget.label} — pastga`}
              disabled={index === widgets.length - 1}
              onClick={() => onChange({ order: moveWidget(order, widget.key, 1), hidden })}
            >
              <ArrowDown className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
