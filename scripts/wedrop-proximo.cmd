@echo off
rem Posta o proximo Reel aprovado da WeDrop. Chamado 5x/dia pelo Agendador de Tarefas
rem (tarefas "DescontoChegando-Reel-1..5"). Sem video aprovado na fila, so registra no log e sai.
cd /d C:\Users\HOME\DESCONTO CHEGANDO
echo ===== %date% %time% >> "D:\WEDROP-pack-videos\_agendador.log"
"C:\Program Files\nodejs\node.exe" node_modules\tsx\dist\cli.mjs scripts\wedrop-reel.ts --proximo >> "D:\WEDROP-pack-videos\_agendador.log" 2>&1
