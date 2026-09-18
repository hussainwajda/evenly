import { Archive, ArchiveRestore, Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from '@/components/CategoryIcon'
import { PageHeader, Section } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveCategory, setCategoryArchived } from '@/db/repo'
import { useCategories } from '@/hooks/useData'
import { FALLBACK_CATEGORY_ID } from '@/lib/categorize'
import type { Category } from '@/lib/types'
import { cn } from '@/lib/utils'

export function CategoriesPage() {
  const categories = useCategories()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const active = categories.filter((c) => !c.archived)
  const archived = categories.filter((c) => c.archived)

  const row = (c: Category) => (
    <li key={c.id}>
      <button type="button" onClick={() => setEditing(c)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60">
        <CategoryIcon icon={c.icon} color={c.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-sm text-muted-foreground">{c.keywords.length ? c.keywords.slice(0, 5).join(', ') : 'No auto-categorise words'}</p>
        </div>
      </button>
    </li>
  )

  return (
    <>
      <PageHeader
        title="Categories"
        backTo="/more"
        actions={
          <Button className="h-11 rounded-full" onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Add
          </Button>
        }
      />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{active.map(row)}</ul>
        {archived.length ? (
          <Section title="Archived">
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card opacity-80">{archived.map(row)}</ul>
          </Section>
        ) : null}
      </div>
      <CategorySheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        category={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function CategorySheet({ category, open, onClose }: { category: Category | null; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'circle-ellipsis')
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0])
  const [keywords, setKeywords] = useState(category?.keywords.join(', ') ?? '')
  const [error, setError] = useState<string>()

  async function save() {
    if (!name.trim()) {
      setError('Enter a name')
      return
    }
    const kw = keywords
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
    await saveCategory({ name, icon, color, keywords: [...new Set(kw)] }, category?.id)
    onClose()
    toast.success(category ? 'Category updated' : 'Category added')
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={category ? 'Edit category' : 'New category'}
      footer={
        <>
          {category && category.id !== FALLBACK_CATEGORY_ID ? (
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={async () => {
                await setCategoryArchived(category.id, !category.archived)
                onClose()
                toast(category.archived ? 'Category restored' : 'Category archived. Past expenses keep it.')
              }}
            >
              {category.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {category.archived ? 'Restore' : 'Archive'}
            </Button>
          ) : null}
          <Button type="submit" form="category-form" className="h-12 flex-1 text-base">
            Save
          </Button>
        </>
      }
    >
      <form
        id="category-form"
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="flex items-center gap-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(undefined)
              }}
              className="h-12"
              aria-invalid={Boolean(error)}
            />
            {error ? <p className="text-sm text-negative">{error}</p> : null}
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Icon</legend>
          <div className="grid grid-cols-6 gap-1.5">
            {Object.keys(CATEGORY_ICONS).map((key) => {
              const Icon = CATEGORY_ICONS[key]
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={icon === key}
                  aria-label={key.replace(/-/g, ' ')}
                  onClick={() => setIcon(key)}
                  className={cn(
                    'grid aspect-square min-h-11 place-items-center rounded-xl border transition-colors',
                    icon === key ? 'border-brand bg-brand/10' : 'border-transparent bg-muted/50 text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Colour</legend>
          <div className="grid grid-cols-7 gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={color === c}
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className="grid aspect-square min-h-11 place-items-center rounded-full ring-offset-2 ring-offset-background transition-shadow aria-pressed:ring-2 aria-pressed:ring-foreground"
                style={{ backgroundColor: c }}
              >
                {color === c ? <Check className="size-5 text-white drop-shadow" aria-hidden /> : null}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="cat-keywords">Auto-categorise words</Label>
          <Textarea id="cat-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={3} placeholder="chai, coffee, samosa" />
          <p className="text-xs text-muted-foreground">Comma separated. Expenses with these words get this category automatically.</p>
        </div>
      </form>
    </FormSheet>
  )
}
