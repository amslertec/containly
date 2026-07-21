import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Info, ShieldAlert } from 'lucide-react';
import type { CreateEndpoint, Endpoint, SshAuth, UpdateEndpoint } from '@containly/shared';
import type { useEndpointMutations } from '../hooks/admin';
import { Dialog, DialogContent, DialogTitle } from './ui/Dialog';
import { Button } from './ui/Button';
import { Input, Label, Textarea } from './ui/primitives';
import { toast } from './Toaster';
import { ApiError } from '../lib/api';
import { cn } from '../lib/utils';

type Muts = ReturnType<typeof useEndpointMutations>;

const DAEMON_JSON = `{
  "hosts": ["fd://", "tcp://0.0.0.0:2376"],
  "tls": true,
  "tlsverify": true,
  "tlscacert": "/etc/docker/certs/ca.pem",
  "tlscert":   "/etc/docker/certs/server-cert.pem",
  "tlskey":    "/etc/docker/certs/server-key.pem"
}`;

// systemd-Drop-in: entfernt das voreingestellte „-H fd://“, damit `hosts` aus
// daemon.json nicht kollidiert. Ohne diesen Schritt startet Docker nicht.
const SYSTEMD_OVERRIDE = `sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/override.conf >/dev/null <<'EOF'
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker`;

// Vollständige openssl-Sequenz zum Erzeugen von CA-, Server- und Client-Zertifikaten.
const CERT_SCRIPT = `HOST=<HOST>   # IP oder Domain des Docker-Hosts

# CA
openssl genrsa -out ca-key.pem 4096
openssl req -new -x509 -days 3650 -key ca-key.pem -sha256 \\
  -out ca.pem -subj "/CN=docker-ca"

# Server-Zertifikat (Host MUSS als SAN rein, sonst schlaegt die TLS-Pruefung fehl)
openssl genrsa -out server-key.pem 4096
openssl req -new -key server-key.pem -out server.csr -subj "/CN=$HOST"
# bei IP:  IP:$HOST   |   bei Domain:  DNS:$HOST
echo "subjectAltName=IP:$HOST,IP:127.0.0.1" > ext.cnf
echo "extendedKeyUsage=serverAuth" >> ext.cnf
openssl x509 -req -days 3650 -sha256 -in server.csr -CA ca.pem \\
  -CAkey ca-key.pem -CAcreateserial -out server-cert.pem -extfile ext.cnf

# Client-Zertifikat
openssl genrsa -out key.pem 4096
openssl req -new -key key.pem -out client.csr -subj "/CN=client"
echo "extendedKeyUsage=clientAuth" > extc.cnf
openssl x509 -req -days 3650 -sha256 -in client.csr -CA ca.pem \\
  -CAkey ca-key.pem -CAcreateserial -out cert.pem -extfile extc.cnf

# Server-Dateien für den Daemon ablegen
sudo mkdir -p /etc/docker/certs
sudo cp ca.pem server-cert.pem server-key.pem /etc/docker/certs/`;

export function EndpointDialog({
  open,
  endpoint,
  onClose,
  mutations,
}: {
  open: boolean;
  /** Wenn gesetzt → Bearbeiten-Modus (Typ ist dann fix). */
  endpoint?: Endpoint | null;
  onClose: () => void;
  mutations: Muts;
}) {
  const { t } = useTranslation();
  const isEdit = !!endpoint;
  // Eingebauter Socket-Endpoint: nur umbenennbar.
  const isSocket = endpoint?.type === 'socket';

  const [type, setType] = useState<'tcp' | 'ssh'>('tcp');
  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('2376');
  const [ca, setCa] = useState('');
  const [cert, setCert] = useState('');
  const [key, setKey] = useState('');
  const [sshUser, setSshUser] = useState('');
  const [sshAuth, setSshAuth] = useState<SshAuth>('password');
  const [sshPassword, setSshPassword] = useState('');
  const [sshPrivateKey, setSshPrivateKey] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [stackPaths, setStackPaths] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // Beim Öffnen (oder Wechsel des Ziel-Endpoints) Felder initialisieren.
  useEffect(() => {
    if (!open) return;
    setStackPaths(endpoint?.stackPaths.join('\n') ?? '');
    if (endpoint) {
      setType(endpoint.type === 'ssh' ? 'ssh' : 'tcp');
      setName(endpoint.name);
      setHost(endpoint.host ?? '');
      setPort(String(endpoint.port ?? (endpoint.type === 'ssh' ? 22 : 2376)));
      setSshUser(endpoint.sshUser ?? '');
      setSshAuth(endpoint.sshAuth ?? 'password');
    } else {
      setType('tcp');
      setName('');
      setHost('');
      setPort('2376');
      setSshUser('');
      setSshAuth('password');
    }
    setCa('');
    setCert('');
    setKey('');
    setSshPassword('');
    setSshPrivateKey('');
    setSshPassphrase('');
  }, [open, endpoint]);

  const paths = stackPaths
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const submit = async (): Promise<void> => {
    try {
      if (isEdit) {
        const body: UpdateEndpoint = { name, stackPaths: paths };
        if (isSocket) {
          // nur Name + Pfade
        } else if (type === 'tcp') {
          body.host = host;
          body.port = Number(port);
          if (ca && cert && key) body.tls = { ca, cert, key };
        } else {
          body.sshHost = host;
          body.sshPort = Number(port);
          body.sshUser = sshUser;
          body.sshAuth = sshAuth;
          if (sshAuth === 'password' && sshPassword) body.sshPassword = sshPassword;
          if (sshAuth === 'key' && sshPrivateKey) {
            body.sshPrivateKey = sshPrivateKey;
            if (sshPassphrase) body.sshPassphrase = sshPassphrase;
          }
        }
        await mutations.update.mutateAsync({ id: endpoint!.id, body });
      } else {
        const body: CreateEndpoint =
          type === 'tcp'
            ? { name, type: 'tcp', host, port: Number(port), tls: { ca, cert, key }, stackPaths: paths }
            : {
                name,
                type: 'ssh',
                sshHost: host,
                sshPort: Number(port),
                sshUser,
                sshAuth,
                stackPaths: paths,
                ...(sshAuth === 'password'
                  ? { sshPassword }
                  : { sshPrivateKey, sshPassphrase: sshPassphrase || undefined }),
              };
        await mutations.create.mutateAsync(body);
      }
      toast.success(isEdit ? t('common.save') : t('common.create'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  };

  const secretOk =
    type === 'tcp'
      ? isEdit || (!!ca && !!cert && !!key)
      : isEdit || (sshAuth === 'password' ? !!sshPassword : !!sshPrivateKey);
  const valid = isSocket
    ? !!name.trim()
    : name.trim() && host.trim() && (type === 'tcp' || sshUser.trim()) && secretOk;
  const pending = mutations.create.isPending || mutations.update.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogTitle>{isEdit ? t('endpoint.edit') : t('endpoint.add')}</DialogTitle>

        <div className="mt-4 max-h-[68vh] space-y-3 overflow-y-auto pr-1">
          {isSocket ? (
            <div>
              <Label>{t('endpoint.form.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <p className="mt-1.5 text-xs text-faint">
                {t('endpoint.typeSocket')} · {t('endpoint.builtin')}
              </p>
            </div>
          ) : (
          <>
          {/* Typ-Auswahl nur beim Anlegen; beim Bearbeiten fix. */}
          {isEdit ? (
            <p className="text-xs text-muted">
              {t('common.type')}: <span className="font-medium text-ink">{t(`endpoint.type${type === 'tcp' ? 'Tcp' : 'Ssh'}`)}</span>
            </p>
          ) : (
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(['tcp', 'ssh'] as const).map((tp) => (
                <button
                  key={tp}
                  onClick={() => {
                    setType(tp);
                    setPort(tp === 'tcp' ? '2376' : '22');
                  }}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    type === tp ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {t(`endpoint.type${tp === 'tcp' ? 'Tcp' : 'Ssh'}`)}
                </button>
              ))}
            </div>
          )}

          {/* Inline-Anleitung */}
          <div className="rounded-md border border-border bg-surface-2">
            <button
              onClick={() => setShowGuide((s) => !s)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-medium text-ink"
            >
              <BookOpen className="h-4 w-4 text-primary" />
              {type === 'tcp' ? t('endpoint.guide.tcpTitle') : t('endpoint.guide.sshTitle')}
              <span className="ml-auto text-xs text-muted">
                {showGuide ? t('endpoint.guide.hide') : t('endpoint.guide.show')}
              </span>
            </button>
            {showGuide && (
              <div className="space-y-2 border-t border-border px-3 py-3 text-[12.5px] leading-relaxed text-muted">
                {type === 'tcp' ? (
                  <ol className="list-decimal space-y-2 pl-4">
                    <li>
                      {t('endpoint.guide.tcp1')}
                      <pre className="mt-1.5 overflow-x-auto rounded bg-bg-sunken p-2 font-mono text-[11px] leading-relaxed text-ink">
                        {CERT_SCRIPT}
                      </pre>
                      <p className="mt-1 text-[11px] text-faint">{t('endpoint.guide.tcp1note')}</p>
                    </li>
                    <li>
                      {t('endpoint.guide.tcp2')}
                      <pre className="mt-1.5 overflow-x-auto rounded bg-bg-sunken p-2 font-mono text-[11px] text-ink">
                        {DAEMON_JSON}
                      </pre>
                    </li>
                    <li className="text-signal">
                      {t('endpoint.guide.tcpSystemd')}
                      <pre className="mt-1.5 overflow-x-auto rounded bg-bg-sunken p-2 font-mono text-[11px] text-ink">
                        {SYSTEMD_OVERRIDE}
                      </pre>
                    </li>
                    <li>{t('endpoint.guide.tcp3')}</li>
                    <li>{t('endpoint.guide.tcp4')}</li>
                    <li className="flex items-start gap-1.5 text-signal">
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {t('endpoint.guide.tcpWarn')}
                    </li>
                  </ol>
                ) : (
                  <ol className="list-decimal space-y-1.5 pl-4">
                    <li>{t('endpoint.guide.ssh1')}</li>
                    <li>{t('endpoint.guide.ssh2')}</li>
                    <li>{t('endpoint.guide.ssh3')}</li>
                  </ol>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>{t('endpoint.form.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="grid grid-cols-[1fr_110px] gap-2">
            <div>
              <Label>{type === 'tcp' ? t('endpoint.form.host') : t('endpoint.form.sshHost')}</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} className="font-mono" placeholder="10.0.0.10" />
            </div>
            <div>
              <Label>{type === 'tcp' ? t('endpoint.form.port') : t('endpoint.form.sshPort')}</Label>
              <Input value={port} onChange={(e) => setPort(e.target.value)} className="font-mono" inputMode="numeric" />
            </div>
          </div>

          {type === 'tcp' ? (
            <>
              <p className="flex items-start gap-1.5 text-xs text-signal">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('endpoint.tlsRequired')}
              </p>
              {isEdit && <KeepHint />}
              {(
                [
                  [t('endpoint.form.ca'), ca, setCa],
                  [t('endpoint.form.cert'), cert, setCert],
                  [t('endpoint.form.key'), key, setKey],
                ] as const
              ).map(([label, val, set], i) => (
                <div key={i}>
                  <Label>{label}</Label>
                  <Textarea
                    value={val}
                    onChange={(e) => set(e.target.value)}
                    rows={3}
                    className="text-[11px]"
                    placeholder={isEdit ? t('endpoint.keepSecretHint') : '-----BEGIN …-----'}
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <div>
                <Label>{t('endpoint.form.sshUser')}</Label>
                <Input value={sshUser} onChange={(e) => setSshUser(e.target.value)} className="font-mono" placeholder="root" />
              </div>
              <div>
                <Label>{t('endpoint.form.sshAuth')}</Label>
                <div className="inline-flex rounded-md border border-border p-0.5">
                  {(['password', 'key'] as SshAuth[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setSshAuth(a)}
                      className={cn(
                        'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                        sshAuth === a ? 'bg-primary text-primary-ink' : 'text-muted hover:text-ink',
                      )}
                    >
                      {a === 'password' ? t('endpoint.form.sshAuthPassword') : t('endpoint.form.sshAuthKey')}
                    </button>
                  ))}
                </div>
              </div>
              {isEdit && <KeepHint />}
              {sshAuth === 'password' ? (
                <div>
                  <Label>{t('endpoint.form.sshPassword')}</Label>
                  <Input
                    type="password"
                    value={sshPassword}
                    onChange={(e) => setSshPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder={isEdit ? t('endpoint.keepSecretHint') : ''}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <Label>{t('endpoint.form.sshPrivateKey')}</Label>
                    <Textarea
                      value={sshPrivateKey}
                      onChange={(e) => setSshPrivateKey(e.target.value)}
                      rows={4}
                      className="text-[11px]"
                      placeholder={isEdit ? t('endpoint.keepSecretHint') : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                    />
                  </div>
                  <div>
                    <Label>{t('endpoint.form.sshPassphrase')}</Label>
                    <Input
                      type="password"
                      value={sshPassphrase}
                      onChange={(e) => setSshPassphrase(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </>
              )}
            </>
          )}
          </>
          )}

          <div className="border-t border-border pt-3">
            <Label>{t('endpoint.form.stackPaths')}</Label>
            <Textarea
              value={stackPaths}
              onChange={(e) => setStackPaths(e.target.value)}
              rows={2}
              className="text-[12px]"
              placeholder="/var/docker/container"
            />
            <p className="mt-1 text-[11px] text-faint">{t('endpoint.form.stackPathsHint')}</p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} loading={pending} disabled={!valid}>
            {isEdit ? t('common.save') : t('common.create')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KeepHint() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-1.5 text-xs text-faint">
      <Info className="h-3.5 w-3.5" />
      {t('endpoint.keepSecretHint')}
    </p>
  );
}
