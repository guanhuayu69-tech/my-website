# 阿里云 ECS 生产配置模板

此目录只保存可公开提交的部署模板，不包含服务器地址、登录密码、API 密钥或证书私钥。

## 文件

- `nginx-pujiantang.conf`：根域与 `www`、HTTP 转 HTTPS、Node 反向代理、咨询接口限流及安全响应头。
- `pujiantang.service`：由 systemd 管理本机 Node 服务，并在故障时自动重启。

## 必须先替换的占位符

在复制到服务器前，替换以下内容：

- Nginx：`__TLS_FULLCHAIN_FILE__`、`__TLS_PRIVATE_KEY_FILE__`、`__ACME_CHALLENGE_ROOT__`。
- systemd：`__SITE_USER__`、`__SITE_GROUP__`。建议使用没有交互登录权限的专用低权限账号。

不要把证书私钥或 `.env` 提交到 Git。服务器上的 `.env` 建议位于 `/srv/pujiantang/shared/.env`，权限设为仅站点账号可读，并至少包含 `.env.example` 中列出的变量。正式环境必须使用新生成的 DeepSeek 密钥和高强度随机 `CHAT_SESSION_SECRET`。

## 建议安装位置

```text
/srv/pujiantang/current/       构建后的当前版本及运行脚本
/srv/pujiantang/shared/.env    仅服务器保存的密钥与环境变量
/etc/systemd/system/pujiantang.service
/etc/nginx/conf.d/pujiantang.conf
```

## 启用前检查顺序

1. 安装 Node.js 22 或更高版本、Nginx，并创建专用站点账号。
2. 在 `/srv/pujiantang/current` 执行 `npm run build`，确认 `dist/client` 与 `dist/server/index.js` 已生成。
3. 填写服务器 `.env`，保证 `PUBLIC_ORIGIN=https://pujiantcm.com.cn`，且不要在终端截图或聊天中展示密钥。
4. 替换本目录模板里的全部占位符；证书必须覆盖 `pujiantcm.com.cn` 和 `www.pujiantcm.com.cn`。
5. 先检查 systemd 与 Nginx 配置，再启用服务。若系统的 Node 路径不是 `/usr/bin/node`，同步修改 service 的 `ExecStart`。
6. 先在服务器本机验证 `127.0.0.1:3000`，再开放 HTTPS；安全组只需开放公网 TCP 80/443，不要开放 3000。
7. HTTPS 完整验证后再切换 DNS，并检查根域、`www` 跳转、静态资源、咨询、失败重试与手机端。

`/api/chat` 在 Nginx 层默认按来源 IP 限制为每分钟 12 次、短时突发 4 次、同时最多 2 个连接，请根据实际客流和误伤情况调整。Node 应用另有每进程每来源 IP 每分钟 12 次的内存限流，并默认在等待 DeepSeek 40 秒后超时；`.env` 中保留 `DEEPSEEK_TIMEOUT_MS=40000` 即可。Nginx 请求体上限为 32 KiB，Node 应用仍保留自身更严格的 30,000 字节检查。

HSTS 含 `includeSubDomains`。仅在根域和 `www` 的 HTTPS 都已确认有效后启用生产配置；如果其他子域尚未配置 HTTPS，应先移除 `includeSubDomains`，避免影响它们。
