// plugin.json の version と CHANGELOG.md のいちばん上の version がそろっているかを確かめる。
// 引数に base（origin/main など）を渡すと、hooks/・types/ を変えたのに version が上がっていないときも落とす。
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const base = process.argv[2] || ''
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })

const versionOf = json => JSON.parse(json).version
const current = versionOf(readFileSync('.claude-plugin/plugin.json', 'utf8'))

// 「## 1.2.3 — 日付」の形の、いちばん上の見出し
const top = readFileSync('CHANGELOG.md', 'utf8').match(/^## (\d+\.\d+\.\d+)/m)?.[1]

const errors = []
if (top !== current) {
  errors.push(`CHANGELOG.md のいちばん上の version（${top ?? 'なし'}）が plugin.json の version（${current}）と違います`)
}

// 1.2.10 > 1.2.9 のように、数として比べる
const newer = (a, b) => {
  const [x, y] = [a, b].map(v => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

if (base) {
  const mergeBase = git('merge-base', base, 'HEAD').trim()
  // hooks/ から外へ移したファイルも数えるよう、rename を分けずに出す
  const changed = git('diff', '--no-renames', '--name-only', mergeBase, 'HEAD').split('\n').filter(Boolean)
  const touched = changed.filter(f => f.startsWith('hooks/') || f.startsWith('types/'))
  if (touched.length > 0) {
    const before = versionOf(git('show', `${mergeBase}:.claude-plugin/plugin.json`))
    if (!newer(current, before)) {
      errors.push(
        `hooks/・types/ を変えています（${touched.join(', ')}）が、plugin.json の version が上がっていません（${before} → ${current}）。` +
          '上げないと、入れている人に届きません（README の「リリース」）',
      )
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`::error::${e}`)
  process.exit(1)
}
console.log(`version ${current}：OK`)
