# Examen pratique : Automatisation des infrastructures

**Master DevOps & Cloud : ISET Tozeur**
Provisioning multi-VMs avec Vagrant et déploiement orchestré par Ansible

**Étudiante :** Nour Kidoudi

---

## 1. Architecture

| VM | Hostname | IP privée | Rôle |
|---|---|---|---|
| `ansible-control` | control-node | 192.168.56.10 | Contrôleur Ansible (Ubuntu 20.04) |
| `web1` | webserver-01 | 192.168.56.11 | Serveur Web (Nginx + PHP-FPM) |
| `web2` | webserver-02 | 192.168.56.12 | Serveur Web (Nginx + PHP-FPM) |
| `db1` | dbserver-01 | 192.168.56.20 | Serveur BDD (MySQL Server) |

**Environnement :** VM Ubuntu sous VMware, avec Vagrant 2.2.6 et VirtualBox 6.1 installés dedans (virtualisation imbriquée). Les 4 VMs de l'examen utilisent la box `ubuntu/focal64`. Ansible 2.9.6.

## 2. Structure du projet

```
project-devops/
├── Vagrantfile
├── inventory.ini
├── site.yml
├── group_vars/
│   └── all.yml
└── roles/
    ├── db/
    │   ├── tasks/main.yml
    │   ├── templates/mysqld.cnf.j2
    │   └── handlers/main.yml
    └── web/
        ├── tasks/main.yml
        ├── templates/
        │   ├── nginx_site.j2
        │   └── index.php.j2
        └── handlers/main.yml
```

`group_vars/all.yml` (variables de la base) et `roles/db/handlers/main.yml` (redémarrage de MySQL) s'ajoutent à la structure recommandée de l'annexe.

---

## Partie 1 : Automatisation avec Vagrant

### 1.1 et 1.2 : Vagrantfile unique, 4 VMs, réseau privé

Un seul `Vagrantfile` lève les 4 machines sous `ubuntu/focal64`. Une boucle sur la liste `NODES` définit pour chaque VM son hostname et son IP fixe (`private_network`) :

```ruby
NODES = [
  { name: "ansible-control", host: "control-node", ip: "192.168.56.10", mem: 512 },
  { name: "web1",            host: "webserver-01", ip: "192.168.56.11", mem: 384 },
  { name: "web2",            host: "webserver-02", ip: "192.168.56.12", mem: 384 },
  { name: "db1",             host: "dbserver-01",  ip: "192.168.56.20", mem: 768 },
]
```

Les 4 VMs sont en état `running` :

![vagrant status](captures/vagrant-status.png)

### 1.3 : Provisioning Shell uniquement sur `ansible-control`

Le script de provisioning, réservé à `ansible-control`, installe Ansible (`apt-get install -y ansible`) lors du `vagrant up`. Il copie aussi la clé SSH et configure le client SSH.

Connexion à `ansible-control` et version d'Ansible installée automatiquement (2.9.6) :

![ansible-control](captures/ansible-control.png)

### 1.4 : Génération et distribution des clés SSH

Le `Vagrantfile` génère une paire de clés (`.ssh_keys/id_rsa`) si elle n'existe pas :
- la **clé privée** est copiée sur `ansible-control` (`~/.ssh/id_rsa`, droits `600`) ;
- la **clé publique** est ajoutée à `authorized_keys` de `web1`, `web2` et `db1`.

Connexion SSH sans mot de passe depuis `ansible-control` vers les 3 nœuds :

![SSH sans mot de passe](captures/vms-ssh.png)

---

## Partie 2 : Structuration et configuration Ansible

### 2.1 : Inventaire et test ad-hoc `ping`

`inventory.ini` définit les groupes `[webservers]` (web1, web2) et `[dbservers]` (db1), ainsi que l'utilisateur et la clé SSH dans `[all:vars]` :

```ini
[webservers]
web1 ansible_host=192.168.56.11
web2 ansible_host=192.168.56.12

[dbservers]
db1 ansible_host=192.168.56.20

[all:vars]
ansible_user=vagrant
ansible_ssh_private_key_file=~/.ssh/id_rsa
ansible_python_interpreter=/usr/bin/python3
```

Test : `ansible all -i inventory.ini -m ping`

![ansible ping](captures/ping-success.png)

### 2.2 : Rôle `db` : installation et sécurisation de MySQL

Le rôle `db` :
- installe `mysql-server` et `python3-pymysql` (nécessaire aux modules `mysql_*`) ;
- déploie `mysqld.cnf.j2` avec `bind-address = 0.0.0.0` (MySQL écoute sur toutes les interfaces) ;
- redémarre MySQL via un **handler** quand la configuration change ;
- crée la base `app_db` ;
- crée l'utilisateur `app_user` avec accès limité au réseau `192.168.56.%` (`192.168.56.0/24`) et uniquement sur `app_db.*`.

`update_password: on_create` garde la tâche idempotente.

Exécution du rôle `db` (`--limit dbservers`) :

![Exécution du rôle db](captures/play-recap1.png)

### 2.3 : Rôle `web` : Nginx + PHP-FPM + application

Le rôle `web` :
- installe `nginx`, `php-fpm` et `php-mysql` ;
- déploie un **VirtualHost Nginx** (`nginx_site.j2`) qui transmet les fichiers PHP à PHP-FPM via le socket `/run/php/php7.4-fpm.sock`, et désactive le site par défaut ;
- déploie le **template Jinja2** `index.php.j2`, qui affiche l'IP du serveur web (`{{ ansible_host }}`) et le résultat de la connexion à `app_db` sur `192.168.56.20` ;
- utilise un **handler** `Restart nginx`, déclenché à chaque modification de la configuration Nginx.

### 2.4 : Playbook principal `site.yml`

Le playbook appelle le rôle `db` sur `dbservers`, puis le rôle `web` sur `webservers`. La base est prête avant les serveurs web.

```yaml
---
- name: Configurer le serveur de base de données
  hosts: dbservers
  become: true
  roles:
    - db

- name: Configurer les serveurs web
  hosts: webservers
  become: true
  roles:
    - web
```

---

## Partie 3 : Validation et tests d'intégration

### 3.1 : Exécution du playbook principal

```bash
ansible-playbook -i inventory.ini site.yml
```

Exécution sans erreur (`failed=0`) sur `db1`, `web1` et `web2` :

![Exécution de site.yml](captures/playbook3-1.png)

### 3.2 : Accès HTTP sur `192.168.56.11` et `192.168.56.12`

Test en ligne de commande :

![curl](captures/curl.png)

Test dans le navigateur :

![Navigateur](captures/navigator.png)

Les deux serveurs affichent leur propre IP et la confirmation **« Connexion réussie à la base app_db sur 192.168.56.20 »**.

### 3.3 : Idempotence

Le playbook est relancé une seconde fois. Le PLAY RECAP affiche **`changed=0`** pour `db1`, `web1` et `web2`, donc le déploiement est idempotent :

![Idempotence](captures/Idempotence3-3.png)

---

## Conclusion

| Composante | Résultat |
|---|---|
| Vagrant Multi-VM (4 VMs, IP fixes, SSH) | 4 VMs `running`, IP privées configurées |
| Provisioning du contrôleur | Ansible 2.9.6 installé automatiquement, clés SSH fonctionnelles |
| Inventaire et Ansible | `inventory.ini` et ping ad-hoc : 3 × SUCCESS |
| Rôles `db` et `web` | MySQL, Nginx + PHP-FPM, templates Jinja2, handlers |
| Playbook et tests | `site.yml` sans erreur, HTTP et BDD OK, idempotence validée (`changed=0`) |
