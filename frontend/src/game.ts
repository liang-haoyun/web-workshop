// 真心话大冒险的消息协议与大冒险名单
// 约定：所有游戏消息以 GAME_PREFIX 开头，后接 JSON 载荷；
// 聊天室中以此前缀开头的消息会被过滤出来，在游戏面板中单独渲染

export const GAME_PREFIX = "【真心话大冒险】";

export type GamePayload =
  | { type: "round_start"; round: number; winner: string; loser: string }
  | { type: "truth"; round: number; question: string }
  | { type: "dare"; round: number; index: number; text: string }
  | { type: "done"; round: number };

export const isGameMessage = (content: string): boolean =>
  content.startsWith(GAME_PREFIX);

export const parseGameMessage = (content: string): GamePayload | null => {
  if (!isGameMessage(content)) return null;
  try {
    const payload = JSON.parse(content.slice(GAME_PREFIX.length));
    if (payload && typeof payload === "object" && typeof payload.type === "string") {
      return payload as GamePayload;
    }
    return null;
  } catch {
    return null;
  }
};

export const encodeGameMessage = (payload: GamePayload): string =>
  GAME_PREFIX + JSON.stringify(payload);

// 大冒险惩罚项目名单，硬编码在前端以保证所有客户端一致；
// 抽取结果随消息广播（带 index 和 text），展示以消息为准，避免名单版本漂移
export const DARE_LIST: string[] = [
  "模仿一种动物的叫声，持续 10 秒",
  "用屁股写自己的名字",
  "唱一首歌的副歌部分",
  "用方言大声说“我是世界上最帅的人”",
  "保持大笑 15 秒，不许中断",
  "做 10 个俯卧撑或深蹲",
  "对窗外大喊“我热爱学习”",
  "模仿在场一位成员的口头禅和动作，直到有人猜出是谁",
  "用表情包的方式演绎“开心、愤怒、委屈”三种情绪",
  "朗读你手机里最近一条搜索记录",
  "让大家给你摆一个搞笑自拍姿势并拍照留念",
  "表演一段 10 秒的即兴舞蹈",
  "用歌声说出你接下来想说的三句话",
  "倒着说出在场所有人的名字",
  "扮演新闻主播，播报“某人输了真心话大冒险”这条新闻",
  "说三个形容自己的词，不许重复别人的",
  "闭上眼睛，准确指出房间里的三个物品",
  "模仿一位老师或名人的语气说“下课”",
  "单脚站立 30 秒，同时背一首古诗",
  "给左边的人一个真诚的赞美",
  "学婴儿哭 10 秒",
  "用手比划一道菜名，直到有人猜出来",
  "宣布自己将主导下一轮游戏的惩罚规则（仅口头，无实权）",
  "站起来转三圈然后走直线",
];
