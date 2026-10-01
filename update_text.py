import re

with open('src/app/analisa/page.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """        if (tCur > tPrev) {
           noteParts.push(`Tarif Naik ${diffTarif.toLocaleString('id-ID')}`);
        } else if (tCur < tPrev) {
           noteParts.push(`Tarif Turun ${diffTarif.toLocaleString('id-ID')}`);
        }
        
        const finalNote = noteParts.join(' & ');
        
        if (finalNote === '') {
           setEditingNote({ outlet, category, text: `Tidak ada perubahan usage/tarif.` });
        }"""

new_block = """        if (diffTarif >= 100) {
           if (tCur > tPrev) {
              noteParts.push(`Tarif naik ${diffTarif.toLocaleString('id-ID')}`);
           } else if (tCur < tPrev) {
              noteParts.push(`Tarif turun ${diffTarif.toLocaleString('id-ID')}`);
           }
        }
        
        const finalNote = noteParts.join(' & ');
        
        if (finalNote === '') {
           setEditingNote({ outlet, category, text: `-` });
        }"""

if old_block in content:
    content = content.replace(old_block, new_block)
    with open('src/app/analisa/page.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully replaced block")
else:
    print("Could not find exact match")
