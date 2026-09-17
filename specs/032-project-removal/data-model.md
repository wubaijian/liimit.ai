# Data Model

RemoveProjectInput={projectId:string,mode:'list-only'|'trash'}。
RemoveProjectResult={removed:boolean,projectId:string}。取消为false；失败reject。
项目数组去掉指定ID；设置、凭据、费用与历史不变。
idle→确认→核验→停止预览→可选trash→移除记录→idle；finally释放锁。
