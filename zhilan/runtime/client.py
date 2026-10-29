import socket,sys
s=socket.socket(socket.AF_UNIX);s.settimeout(190);s.connect('/work/.control.sock');s.sendall(sys.stdin.buffer.read().rstrip(b'\n')+b'\n')
while True:
 d=s.recv(65536)
 if not d:break
 sys.stdout.buffer.write(d)
s.close()
