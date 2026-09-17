# Contract

project:remove 接受有界非空ID及mode枚举，主进程查注册路径。可信renderer沿用secureHandle。
list-only允许文件不存在；trash核验目录、身份、路径组件和非保护/重叠目录。确认后再校验。
并发/活动任务拒绝，先停止或等待。取消不停止预览、不写磁盘。
trash失败不移除记录；store失败保留记录并提示从废纸篓恢复；所有分支释放锁。
