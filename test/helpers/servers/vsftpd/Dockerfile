# Built from Debian rather than pulled, so it runs natively on arm64: fauria/vsftpd is amd64-only
# (fabrica-dev-kit-dfp)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends vsftpd \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p /var/run/vsftpd/empty \
	&& useradd -m -d /home/fdk -s /bin/sh fdk && echo 'fdk:secret' | chpasswd
COPY vsftpd.conf /etc/vsftpd.conf
CMD ["vsftpd", "/etc/vsftpd.conf"]
