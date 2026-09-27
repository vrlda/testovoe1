// Translations for the supplied configuration. IDs, answers and stored JSON stay unchanged.
const translations: Record<string, string> = {
  'UTM fields exceed allowed limits.':
    'Параметры кампании слишком длинные или имеют неверный формат.',
  'Too many requests. Please retry shortly.':
    'Слишком много запросов. Подождите минуту и повторите.',
  'Session event limit reached.': 'Достигнут лимит событий сессии. Начните заново.',
  "Find your team's operating style": 'Подберите формат работы команды',
  'Team operating-style check': 'Формат работы команды',
  '2-minute team check': 'Оценка команды за две минуты',
  'Build a work model your team can actually follow': 'Подберите удобный формат работы для команды',
  'Answer a few questions and get a fictional recommendation for this technical exercise.':
    'Ответьте на несколько вопросов и получите пример рекомендации в рамках тестового задания.',
  'How should your team really work?': 'Какой формат работы подходит вашей команде?',
  'Answer a few questions to get a practical operating-style recommendation.':
    'Ответьте на несколько вопросов и получите рекомендации по организации работы.',
  Start: 'Начать',
  'Show me': 'Подобрать формат',
  'How many people are on the team?': 'Сколько человек в команде?',
  'Include regular contractors who join team rituals.':
    'Учитывайте постоянных подрядчиков, которые участвуют в работе команды.',
  people: 'чел.',
  'Enter the team size.': 'Укажите размер команды.',
  'The team must have at least one person.': 'В команде должен быть хотя бы один человек.',
  'For this demo, enter a value up to 200.': 'В этом примере можно указать не более 200 человек.',
  'Where does the team work most of the time?': 'Где команда работает большую часть времени?',
  'Choose the closest option.': 'Выберите наиболее подходящий вариант.',
  'Fully remote': 'Полностью удалённо',
  Hybrid: 'В гибридном формате',
  'Mostly in the office': 'В основном в офисе',
  "Select the team's main work mode.": 'Выберите основной формат работы команды.',
  'What should the operating model improve?': 'Что вы хотите улучшить в работе команды?',
  'What would make the biggest difference right now?': 'Какие изменения сейчас важнее всего?',
  'Choose between one and three priorities.': 'Выберите от одного до трёх приоритетов.',
  'Choose up to three outcomes.': 'Выберите до трёх результатов.',
  'Decision speed': 'Скорость принятия решений',
  'Deep-focus time': 'Время для сосредоточенной работы',
  'Team connection': 'Взаимодействие в команде',
  'Lower operating cost': 'Снижение рабочих расходов',
  'Faster onboarding': 'Быстрая адаптация новичков',
  'Choose at least one priority.': 'Выберите хотя бы один приоритет.',
  'Choose no more than three priorities.': 'Выберите не более трёх приоритетов.',
  'How far apart are your working hours?': 'Насколько различается рабочее время участников?',
  'Think about the earliest and latest regular working times.':
    'Сравните рабочие часы тех, кто начинает раньше и позже остальных.',
  'Mostly the same hours': 'Рабочие часы почти совпадают',
  'About 3–6 hours apart': 'Разница примерно 3–6 часов',
  'More than 6 hours apart': 'Разница больше 6 часов',
  'Select the closest timezone range.': 'Выберите подходящую разницу во времени.',
  'How many office days are expected each week?': 'Сколько дней в неделю нужно работать из офиса?',
  'Enter the usual expectation, not occasional events.':
    'Укажите обычный график, без разовых мероприятий.',
  days: 'дн.',
  'Enter the expected number of office days.': 'Укажите количество офисных дней.',
  'Enter a value from 0 to 5.': 'Введите число от 0 до 5.',
  'How are decisions documented today?': 'Как вы сейчас фиксируете решения?',
  'Choose what happens most often.': 'Выберите наиболее частый вариант.',
  'Mostly discussed in meetings': 'В основном обсуждаем на встречах',
  'Important decisions are documented': 'Записываем важные решения',
  'Written context is the default': 'Обычно всё фиксируем письменно',
  'Select the closest description.': 'Выберите наиболее подходящее описание.',
  'How many tools does the team use every week?':
    'Сколько рабочих инструментов команда использует за неделю?',
  'Count messaging, project, documentation and meeting tools.':
    'Учитывайте чаты, управление задачами, документы и видеосвязь.',
  tools: 'шт.',
  'Enter the number of tools.': 'Укажите количество инструментов.',
  'Enter a value of at least 1.': 'Введите число не меньше 1.',
  'For this demo, enter a value up to 30.':
    'В этом примере можно указать не более 30 инструментов.',
  hours: 'ч.',
  'Building your recommendation…': 'Готовим рекомендации…',
  'We could not build the recommendation': 'Не удалось подготовить рекомендации',
  'Try again': 'Попробовать ещё раз',
  'Async-native': 'Асинхронная работа',
  'Your team will benefit from written context, fewer mandatory meetings and explicit response windows.':
    'Команде помогут письменные договорённости, меньше обязательных встреч и понятные сроки ответа.',
  'Move routine status updates to written check-ins.':
    'Обменивайтесь текущим статусом задач письменно.',
  'Define response-time expectations by channel.':
    'Договоритесь о сроках ответа в каждом канале связи.',
  'Record decisions in one searchable place.': 'Храните решения в одном месте с удобным поиском.',
  'Structured hybrid': 'Гибридная работа с понятными правилами',
  'Your team needs a clear reason for office days and equal access to decisions for remote participants.':
    'Определите цели офисных дней и обеспечьте удалённым участникам равный доступ к решениям.',
  'Give each office day a defined purpose.': 'Определите цель каждого офисного дня.',
  'Document decisions before the end of the day.': 'Записывайте принятые решения до конца дня.',
  'Avoid meetings where only part of the team can participate.':
    'Проводите встречи так, чтобы участвовать могла вся команда.',
  'Office-led with focus protection': 'Офисная работа без лишних отвлечений',
  'Your team can keep an office-led model while protecting uninterrupted work and documenting key decisions.':
    'Сохраните офисный формат, выделив время для работы без отвлечений и фиксации ключевых решений.',
  'Create meeting-free focus blocks.': 'Выделите время для сосредоточенной работы без встреч.',
  'Use the office for collaboration rather than status reporting.':
    'Используйте офисное время для совместной работы над задачами.',
  'Publish decisions for people who were not in the room.':
    'Делитесь решениями с теми, кто не присутствовал на встрече.',
  'Balanced baseline': 'Общие правила работы',
  'Your answers do not point to one dominant model. Start with shared rules and measure what improves.':
    'По вашим ответам нет одного предпочтительного формата. Начните с общих правил и отслеживайте улучшения.',
  'Agree where decisions are recorded.': 'Договоритесь, где фиксировать решения.',
  'Define which work requires a meeting.': 'Определите, какие задачи требуют встречи.',
  'Review the model after 30 days.': 'Оцените выбранный подход через 30 дней.',
  'Your team is ready to reduce meetings': 'Ваша команда готова сократить число встреч',
  'Your hybrid model needs clearer rules': 'Вашему гибридному формату нужны понятные правила',
  'Your office model can be more intentional': 'Сделайте офисную работу более осмысленной',
  'Your team needs a shared operating baseline': 'Вашей команде нужны общие правила работы',
  'View the action list': 'Посмотреть план действий',
  'See the 30-day action list': 'Посмотреть план на 30 дней',
  'Asking about work mode earlier and reframing the result in B will increase the share of sessions reaching a recommendation.':
    'Если в варианте B раньше спросить о формате работы и изменить подачу результата, доля сессий с рекомендацией вырастет.',
  'Sessions reaching a result / sessions started': 'Сессии с результатом / начатые сессии',
  Result: 'Результат',
  'Choose an option': 'Выберите вариант.',
  'Choose valid options': 'Выберите допустимые варианты без повторений.',
  'Choose more options': 'Выберите больше вариантов.',
  'Choose fewer options': 'Выберите меньше вариантов.',
  'Enter a number': 'Введите число.',
  'Number is too small': 'Число меньше допустимого.',
  'Number is too large': 'Число больше допустимого.',
  'Enter a whole step value': 'Введите число с указанным шагом.',
  'Active version changed. Refresh before publishing.':
    'Активная версия изменилась. Обновите данные перед публикацией.',
  'Weights must be numbers from 0 to 100 and total 100.':
    'Доли должны быть числами от 0 до 100 и в сумме давать 100.',
  'No previous version': 'Нет предыдущей версии.',
  'Configuration unavailable': 'Конфигурация недоступна.',
  'An admin token is required.': 'Требуется токен администратора.',
  'Session not found': 'Сессия не найдена.',
  'Session expired': 'Срок действия сессии истёк.',
  'Session advanced. Reloading current step.':
    'Текущий шаг изменился. Загружаем сохранённое состояние.',
  'Invalid server response. Please retry.': 'Некорректный ответ сервера. Попробуйте ещё раз.',
  'Request failed. Please retry.': 'Запрос не выполнен. Попробуйте ещё раз.',
  'Connection timed out. Please retry.': 'Сервер не ответил вовремя. Попробуйте ещё раз.',
  'Request body must be valid JSON smaller than 1 MB.':
    'Нужен корректный JSON размером меньше 1 МБ.',
  'Expected a JSON object.': 'Ожидается JSON-объект.',
  'Invalid funnel config': 'Некорректная конфигурация воронки.',
  'Invalid config': 'Некорректная конфигурация.',
  'Invalid session TTL': 'Некорректный срок действия сессии.',
  'Invalid experiment weights': 'Некорректные доли вариантов эксперимента.',
  'Invalid step': 'Некорректный шаг.',
  'Unknown default result': 'Неизвестный результат по умолчанию.',
  'Invalid result content': 'Некорректное содержимое результата.',
  'Invalid event definitions': 'Некорректные определения событий.',
  'Invalid event name': 'Некорректное название события.',
  'Custom events must be triggered by a base event':
    'Дополнительное событие должно запускаться базовым событием.',
  'Unknown event trigger step': 'Неизвестный шаг запуска события.',
};

export const text = (value: string): string =>
  Object.hasOwn(translations, value) ? translations[value] : value;

export function errorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : '';
  if (Object.hasOwn(translations, value)) return translations[value];
  if (/[а-яё]/i.test(value)) return value;
  const rules: [RegExp, string][] = [
    [/^([AB]): at least six steps required$/, '$1: нужно не менее шести шагов.'],
    [/^([AB]): duplicate step ID$/, '$1: идентификаторы шагов не должны повторяться.'],
    [/^([AB]): intro and result required$/, '$1: нужны начальный экран и результат.'],
    [/^([AB]): result required$/, '$1: нужен экран результата.'],
    [/^Unknown step (.+)$/, 'Неизвестный шаг: $1.'],
    [/^Invalid step type (.+)$/, 'Некорректный тип шага: $1.'],
    [/^Unknown result override (.+)$/, 'Неизвестный результат для переопределения: $1.'],
    [/^Unknown result (.+)$/, 'Неизвестный результат: $1.'],
    [/^Unknown target (.+)$/, 'Неизвестный шаг перехода: $1.'],
    [/^(.+): invalid text$/, '$1: текст должен быть строкой.'],
    [
      /^(.+): options must have unique values and text labels$/,
      '$1: нужны варианты с уникальными значениями и текстовыми названиями.',
    ],
    [/^(.+): invalid selection limits$/, '$1: некорректные ограничения выбора.'],
    [/^(.+): invalid numeric limits$/, '$1: некорректные числовые ограничения.'],
    [/^Missing event (.+)$/, 'Отсутствует событие: $1.'],
    [/^Unsupported properties for (.+)$/, 'Недопустимые свойства события $1.'],
    [/^Missing base event properties for (.+)$/, 'Не указаны обязательные свойства события $1.'],
  ];
  for (const [pattern, replacement] of rules)
    if (pattern.test(value)) return value.replace(pattern, replacement);
  return 'Не удалось выполнить действие. Проверьте соединение и попробуйте ещё раз.';
}

export const percent = (part: number, total: number) =>
  total
    ? `${((part / total) * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : '—';
