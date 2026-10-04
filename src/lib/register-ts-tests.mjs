import { register } from 'node:module'

register(new URL('./resolve-ts-hook.mjs', import.meta.url).href, import.meta.url)
