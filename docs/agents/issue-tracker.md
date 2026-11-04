# Трекер задач: GitHub

Задачи и спецификации этого репозитория хранятся в GitHub Issues. Для всех операций используйте `gh`.

## Соглашения

- **Создать задачу:** `gh issue create --title "..." --body "..."`.
- **Прочитать задачу:** `gh issue view <number> --json number,title,body,labels,comments`.
- **Список задач:** `gh issue list --state open --json number,title,body,labels,comments` с подходящими фильтрами.
- **Добавить комментарий:** `gh issue comment <number> --body "..."`.
- **Добавить или удалить метку:** `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Закрыть задачу:** сначала оставьте комментарий с объяснением, затем выполните `gh issue close <number>`.

Репозиторий определяется по `git remote -v`; перед созданием задач проверяйте его командой `gh repo view --json nameWithOwner`. Создавайте задачи только в этом репозитории.

## Pull request как источник задач для triage

Pull request не используются как источник запросов для triage.

## Публикация в трекере задач

Если навык говорит «опубликовать в трекере задач», создайте GitHub Issue.

## Получение связанной задачи

Если навык говорит «получить связанную задачу», прочитайте её командой `gh issue view`.
