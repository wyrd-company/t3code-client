# relationships:
#   demonstrates: command-line
Output ../../docs/user/t3c/assets/demo.gif
Set Shell bash
Set FontSize 18
Set Width 1000
Set Height 500
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Hide
Type `export PS1='$ '; clear`
Enter
Sleep 300ms
Show
Type `t3c auth pair --server "$DEMO_SERVER" --pairing-token-stdin --name demo < "$DEMO_PAIRING_INPUT"`
Enter
Wait+Line /\$$/
Sleep 3s
Type `started=$(t3c thread start 'Reply with HELLO only.' --project-path "$DEMO_PROJECT" --model gpt-6-luna --json)`
Enter
Wait+Line@3m /\$$/
Sleep 2s
Type `echo "$started"; thread_id=$(jq -r .data.threadId <<< "$started")`
Enter
Wait+Line /\$$/
Sleep 3s
Type `t3c thread wait "$thread_id"`
Enter
Wait+Line@3m /\$$/
Sleep 3s
Type `t3c run 'Reply with HELLO only.' --thread "$thread_id" --model gpt-6-luna`
Enter
Wait+Line@3m /\$$/
Sleep 3s
Type `t3c project list`
Enter
Wait+Line /\$$/
Sleep 3s
Type `t3c thread list`
Enter
Wait+Line /\$$/
Sleep 3s
