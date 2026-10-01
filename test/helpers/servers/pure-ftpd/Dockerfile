# Built from Debian rather than pulled, so it runs natively on arm64: stilliard/pure-ftpd is
# amd64-only and dies under Docker Desktop's Rosetta (fabrica-dev-kit-dfp)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends pure-ftpd \
	&& rm -rf /var/lib/apt/lists/* \
	&& useradd -m -d /home/fdk -s /bin/sh fdk && echo 'fdk:secret' | chpasswd
# System accounts, no anonymous, chrooted to home, chmod allowed as on a real host so a deploy
# can run against it, passive ports to match `-p` in ftp-servers.js. `-H`: without it the reverse
# lookup of each client hangs inside Docker and no greeting is ever sent
CMD ["pure-ftpd", "-l", "unix", "-E", "-A", "-H", "-j", "-P", "localhost", "-p", "30100:30104", "-c", "5", "-C", "5"]
