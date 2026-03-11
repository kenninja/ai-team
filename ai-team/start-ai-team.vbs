Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Users\kenta\Downloads\プログラミング用\ai-team"
WshShell.Run "cmd /c npm run dev", 0, False
