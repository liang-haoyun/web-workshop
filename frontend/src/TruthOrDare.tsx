import { useEffect, useMemo, useState } from "react";
import { Button, Input, message as antdMessage, Modal, Tag } from "antd";
import { user } from "./getUser";
import * as graphql from "./graphql";
import {
  DARE_LIST,
  GamePayload,
  encodeGameMessage,
  isGameMessage,
  parseGameMessage,
} from "./game";
import { Bubble, Card, Container, Link, Scroll, Text } from "./Components";

interface TruthOrDareProps {
  user: user | null;
  room: graphql.GetJoinedRoomsQuery["user_room"][0]["room"] | undefined;
  handleClose: () => void;
}

// 游戏状态机：把整条消息流折叠成一个"当前轮次"视图。
// 依赖 subscription 首次订阅会返回全部历史消息这一事实，
// 新加入或刷新页面的客户端重放同样的消息即可重建状态
interface Round {
  round: number;
  winner: string;
  loser: string;
  action?: { kind: "truth"; question: string } | { kind: "dare"; index: number; text: string };
  done: boolean;
}

const foldMessages = (
  messages: graphql.GetMessagesByRoomSubscription["message"] | undefined
): Round | null => {
  if (!messages) return null;
  let current: Round | null = null;
  for (const m of messages) {
    if (!isGameMessage(m.content)) continue;
    const payload = parseGameMessage(m.content);
    if (!payload) continue;
    if (payload.type === "round_start") {
      current = {
        round: payload.round,
        winner: payload.winner,
        loser: payload.loser,
        done: false,
      };
    } else if (current && payload.type === "truth") {
      current.action = { kind: "truth", question: payload.question };
    } else if (current && payload.type === "dare") {
      current.action = { kind: "dare", index: payload.index, text: payload.text };
    } else if (current && payload.type === "done") {
      current.done = true;
    }
  }
  return current;
};

const TruthOrDare: React.FC<TruthOrDareProps> = ({ user, room, handleClose }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [question, setQuestion] = useState<string>("");
  const [showDareList, setShowDareList] = useState<boolean>(false);

  // 成员名单，供庄家抽取赢家/输家
  const { data: memberData, error: memberError } = graphql.useGetRoomMembersQuery(
    {
      skip: !room,
      variables: { room_uuid: room?.uuid },
    }
  );
  useEffect(() => {
    if (memberError) {
      console.error(memberError);
      antdMessage.error("获取房间成员失败！");
    }
  }, [memberError]);

  // 复用聊天室的订阅：游戏状态完全来自消息流
  const { data, error } = graphql.useGetMessagesByRoomSubscription({
    skip: !room,
    variables: { room_uuid: room?.uuid },
  });
  useEffect(() => {
    if (error) {
      console.error(error);
      antdMessage.error("获取消息失败！");
    }
  }, [error]);

  const [addMessageMutation] = graphql.useAddMessageMutation();

  const members = useMemo(
    () => memberData?.user_room.map((ur) => ur.user) ?? [],
    [memberData]
  );
  const currentRound = useMemo(() => foldMessages(data?.message), [data]);

  const send = async (payload: GamePayload) => {
    setLoading(true);
    const result = await addMessageMutation({
      variables: {
        user_uuid: user?.uuid,
        room_uuid: room?.uuid,
        content: encodeGameMessage(payload),
      },
    });
    if (result.errors) {
      console.error(result.errors);
      antdMessage.error("发送消息失败！");
    }
    setLoading(false);
  };

  // 庄家 = 上一轮的输家；首轮无庄家，任何人都可开局
  const isHost = currentRound
    ? !currentRound.done
      ? currentRound.winner === user?.uuid
      : false
    : true;
  const isWinner = currentRound && currentRound.winner === user?.uuid;
  const nameOf = (uuid: string) =>
    members.find((m) => m.uuid === uuid)?.username ?? "未知用户";

  const handleStart = async () => {
    if (members.length < 2) {
      antdMessage.error("房间成员不足两人！");
      return;
    }
    // 方案 A（伪联机）：本地随机抽取赢家和输家，结果通过消息广播
    const winnerIdx = Math.floor(Math.random() * members.length);
    let loserIdx = Math.floor(Math.random() * (members.length - 1));
    if (loserIdx >= winnerIdx) loserIdx += 1;
    await send({
      type: "round_start",
      round: (currentRound?.round ?? 0) + 1,
      winner: members[winnerIdx].uuid,
      loser: members[loserIdx].uuid,
    });
  };

  const handleTruth = async () => {
    if (!question) {
      antdMessage.error("问题不能为空！");
      return;
    }
    await send({ type: "truth", round: currentRound!.round, question });
    setQuestion("");
  };

  const handleDare = async () => {
    if (!currentRound) return;
    const index = Math.floor(Math.random() * DARE_LIST.length);
    await send({
      type: "dare",
      round: currentRound.round,
      index,
      text: DARE_LIST[index],
    });
  };

  const handleDone = async () => {
    if (!currentRound) return;
    await send({ type: "done", round: currentRound.round });
  };

  const Close = () => (
    <Button
      type="link"
      style={{
        width: "40px",
        height: "40px",
        fontSize: "12px",
        position: "absolute",
        right: 0,
        top: 0,
      }}
      className="need-interaction"
      onClick={handleClose}
    >
      ❌
    </Button>
  );

  if (!user || !room) {
    return null;
  }
  return (
    <Card style={{ width: "300px", height: "500px" }}>
      <Close />
      <Container style={{ margin: "6px" }}>
        <Text>
          <strong>真心话大冒险</strong>
        </Text>
        <Text size="small" style={{ marginTop: "6px", marginBottom: "6px" }}>
          {room.name}
        </Text>
        <Link style={{ marginTop: "6px" }} onClick={() => setShowDareList(true)}>
          📋 查看大冒险公示名单（{DARE_LIST.length} 项）
        </Link>
      </Container>
      <Scroll>
        {currentRound ? (
          <RoundView
            round={currentRound}
            usernameOf={nameOf}
          />
        ) : (
          <Container style={{ height: "120px" }}>
            <Text size="small">还没有开始过的对局，快开一局吧！</Text>
          </Container>
        )}
      </Scroll>
      <div
        className="need-interaction"
        style={{ marginTop: "12px", display: "flex", width: "100%", flexWrap: "wrap" }}
      >
        {currentRound && !currentRound.done ? (
          <>
            {currentRound.action ? (
              // 惩罚完成后由赢家点击进入下一轮
              isWinner ? (
                <Button
                  type="primary"
                  style={{ height: "40px", width: "100%" }}
                  onClick={handleDone}
                  loading={loading}
                >
                  <strong>完成惩罚，开始下一轮</strong>
                </Button>
              ) : (
                <Container style={{ width: "100%" }}>
                  <Text size="small">等待 {nameOf(currentRound.winner)} 确认惩罚完成</Text>
                </Container>
              )
            ) : isWinner ? (
              <>
                <Input
                  placeholder="输入真心话问题"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  style={{ fontSize: "16px", height: "40px", flex: 1 }}
                />
                <Button
                  style={{ height: "40px", marginLeft: "6px" }}
                  type="primary"
                  onClick={handleTruth}
                  loading={loading}
                >
                  <strong>问真心话</strong>
                </Button>
                <Button
                  style={{ height: "40px", width: "100%", marginTop: "6px" }}
                  onClick={handleDare}
                  loading={loading}
                >
                  <strong>抽大冒险</strong>
                </Button>
              </>
            ) : (
              <Container style={{ width: "100%" }}>
                <Text size="small">
                  等待 {nameOf(currentRound.winner)} 出题……
                </Text>
              </Container>
            )}
          </>
        ) : (
          // 未开局或上一轮已结束：庄家（上轮输家）或任何人（首轮）可开局
          isHost || !currentRound ? (
            <Button
              type="primary"
              style={{ height: "40px", width: "100%" }}
              onClick={handleStart}
              loading={loading}
            >
              <strong>🎲 抽取本轮赢家和输家</strong>
            </Button>
          ) : (
            <Container style={{ width: "100%" }}>
              <Text size="small">等待庄家 {nameOf(currentRound.loser)} 开局</Text>
            </Container>
          )
        )}
      </div>
      <Modal
        title={`大冒险公示名单（共 ${DARE_LIST.length} 项）`}
        open={showDareList}
        footer={null}
        onCancel={() => setShowDareList(false)}
      >
        <Scroll style={{ maxHeight: "300px" }}>
          {DARE_LIST.map((item, index) => (
            <Text key={index} size="small" style={{ display: "block", margin: "4px 0" }}>
              {index + 1}. {item}
              {currentRound?.action?.kind === "dare" &&
              currentRound.action.index === index &&
              !currentRound.done ? (
                <Tag color="orange" style={{ marginLeft: "6px" }}>
                  本轮抽中
                </Tag>
              ) : null}
            </Text>
          ))}
        </Scroll>
      </Modal>
    </Card>
  );
};

interface RoundViewProps {
  round: Round;
  usernameOf: (uuid: string) => string;
}

const RoundView: React.FC<RoundViewProps> = ({ round, usernameOf }) => (
  <Container style={{ alignItems: "flex-start", width: "100%" }}>
    <Bubble style={{ width: "fit-content", padding: "4px 10px" }}>
      <Text size="small">
        第 {round.round} 轮{" "}
        {round.done ? (
          <Tag color="green" style={{ marginLeft: "6px" }}>
            已结束
          </Tag>
        ) : (
          <Tag color="orange" style={{ marginLeft: "6px" }}>
            进行中
          </Tag>
        )}
      </Text>
    </Bubble>
    <Text size="small" style={{ marginTop: "6px" }}>
      赢家：{usernameOf(round.winner)}（出题）
    </Text>
    <Text size="small">
      输家：{usernameOf(round.loser)}（受罚）
      {round.done ? "" : " 👈"}
    </Text>
    {round.action &&
      (round.action.kind === "truth" ? (
        <Bubble
          style={{
            width: "fit-content",
            maxWidth: "100%",
            backgroundColor: "rgba(4, 190, 2, 0.25)",
            marginTop: "8px",
          }}
        >
          <Text size="small">真心话：{round.action.question}</Text>
        </Bubble>
      ) : (
        <Bubble
          style={{
            width: "fit-content",
            maxWidth: "100%",
            backgroundColor: "rgba(255, 120, 0, 0.25)",
            marginTop: "8px",
          }}
        >
          <Text size="small">
            大冒险（公示名单第 {round.action.index + 1} 项）：{round.action.text}
          </Text>
        </Bubble>
      ))}
  </Container>
);

export default TruthOrDare;
