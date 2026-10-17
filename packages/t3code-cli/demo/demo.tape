# relationships:
#   demonstrates: command-line
Output ../../docs/assets/demo.gif
Set Shell bash
Set FontSize 18
Set Width 1000
Set Height 500
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Hide
Type "export PS1='$ '; clear"
Enter
Sleep 300ms
Show
Type "t3c run 'Reply with HELLO only.' --model gpt-6-luna"
Enter
Wait+Line@3m /\$$/
Sleep 3s
Type "t3c thread list"
Enter
Wait+Line /\$$/
Sleep 3s
