// All cases below are authored fiction, never copied from browser diary storage.
export const fixtureVersion = 'seeking-light-web-fiction-v1';
export const fixtureMarker = 'TEST_ONLY_FICTION';
const tag = { fixtureMarker, fictional: true };

export const records = [
  { ...tag, id: 'test-single', date: '2026-11-07', time: '09:00', text: '光', scenario: 'single-character' },
  { ...tag, id: 'test-multiline', date: '2026-11-07', time: '09:05', text: '【虚构测试】整理桌面。\n把纸放回抽屉。\n\n没有特别的感受。', scenario: 'multiline' },
  { ...tag, id: 'test-long', date: '2026-11-07', time: '09:10', text: '【虚构测试长文】\n' + '这是一段专为排版测试编写的虚构流水账，不对应任何真人经历。\n'.repeat(100), scenario: 'long-text' },
  { ...tag, id: 'test-fatigue', date: '2026-11-06', time: '21:00', text: '【虚构测试】今天反复回复消息，很累。休息了一会儿，仍然很累，没有好转。', scenario: 'fatigue-without-improvement' },
  { ...tag, id: 'test-insufficient', date: '2026-11-05', time: '12:00', text: '【虚构测试】收到一个包裹。没有记录投入或感受，不能据此推断兴趣。', scenario: 'insufficient-evidence' },
  { ...tag, id: 'test-before-midnight', date: '2026-11-07', time: '23:59', text: '【虚构测试】午夜前记下一句。', scenario: 'before-midnight' },
  { ...tag, id: 'test-after-midnight', date: '2026-11-08', time: '00:01', text: '【虚构测试】午夜后另记一句。', scenario: 'after-midnight' },
];

// Blank cases have an external marker so the input can remain genuinely blank.
export const inputCases = [
  { ...tag, id: 'test-empty', text: '', shouldSave: false },
  { ...tag, id: 'test-whitespace', text: ' \n\t ', shouldSave: false },
  { ...tag, id: 'test-single-input', text: '光', shouldSave: true },
  { ...tag, id: 'test-draft', text: '【虚构测试草稿】这一句尚未提交。\n刷新后仍应保留。', shouldSave: true, submitted: false },
];

export const crossDay = {
  ...tag,
  timezone: 'Asia/Shanghai',
  before: '2026-11-07T23:59:00+08:00',
  after: '2026-11-08T00:01:00+08:00',
  expectedDates: ['2026-11-07', '2026-11-08'],
  recordIds: ['test-before-midnight', 'test-after-midnight'],
  instruction: '固定时钟验证后还需真实跨日测试；本 fixture 不改变页面时钟。',
};
