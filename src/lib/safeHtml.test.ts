import {expect,it} from 'vitest'
import {escapeHtml} from './safeHtml'

it('keeps map label content as text instead of executable HTML',()=>{
 expect(escapeHtml('<img src=x onerror="alert(1)"> & \'label\'')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;label&#39;')
})
