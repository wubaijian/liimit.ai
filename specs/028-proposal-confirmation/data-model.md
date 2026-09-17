# Data Model

Proposal = eventId/projectId/text。Decision = projectId/proposalId/action(confirm|revise|cancel)/revision?。生命周期“修改方案已处理”记录proposalId，阻止重启后二次执行。新用户或助手回复使之前方案失效。
