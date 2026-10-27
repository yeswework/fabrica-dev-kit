# Built from Debian rather than pulled, so it runs natively on arm64: fauria/vsftpd is amd64-only
# (fabrica-dev-kit-dfp)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends vsftpd \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p /var/run/vsftpd/empty \
	&& useradd -m -d /home/fdk -s /bin/sh fdk && echo 'fdk:secret' | chpasswd
COPY vsftpd.conf /etc/vsftpd.conf
# Not as PID 1: orphaned session processes are handed to PID 1, and vsftpd 3.0.3's listener, most
# likely reaping one it never forked, segfaulted (exit 139) in about one live run in three. Under
# `sh` that stopped; the loop starts it again should it ever recur
CMD ["sh", "-c", "while :; do vsftpd /etc/vsftpd.conf; echo \"vsftpd exited $?, restarting\" >&2; done"]
